// Heuristic resume parser: plain text in, partial profile out. Best effort;
// the user reviews everything before it is saved. Exposes JF.resumeParse.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.resumeParse) return;

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  const DATE_RE = `(?:${MONTH_RE}\\s*,?\\s*\\d{4}|\\d{1,2}\\s*/\\s*\\d{4}|\\d{4}\\s*[/-]\\s*\\d{1,2}(?!\\d)|(?:19|20)\\d{2})`;
  const PRESENT_RE = '(?:present|current|now|today|ongoing)';
  const RANGE_RE = new RegExp(`(${DATE_RE})\\s*(?:-|–|—|to|until|through)\\s*(${DATE_RE}|${PRESENT_RE})`, 'i');
  const SINGLE_DATE_RE = new RegExp(`(?:expected\\s+|graduat\\w*\\s+)?(${DATE_RE})`, 'i');

  const HEADINGS = {
    summary: /^(professional\s+|career\s+)?(summary|profile|objective|about(\s+me)?)$/,
    experience: /^((work|professional|relevant|employment|career)\s+)?(experience|history|employment)(\s+history)?$/,
    education: /^(education|academic\s+background|education\s*(&|and)\s*training|academics)$/,
    skills: /^((technical|core|key)\s+)?(skills|competencies|technologies|tech\s+stack|tools)(\s*(&|and)\s*(tools|technologies|expertise|interests))?$/,
    other: /^(projects?|personal\s+projects|certifications?|licenses|awards|honors|publications|volunteer(ing)?(\s+experience)?|languages|interests|hobbies|references|activities|leadership|achievements|courses|coursework)$/,
  };

  const TITLE_WORDS = /\b(engineer|developer|manager|analyst|designer|intern|lead|director|consultant|scientist|specialist|associate|coordinator|architect|administrator|officer|assistant|vp|head|president|founder|co-founder|programmer|technician|researcher|teacher|instructor|representative|accountant|editor|writer|strategist|owner|partner|advisor|fellow|sre|devops|cto|ceo|cfo|staff|principal|senior|junior|sr\.?|jr\.?)\b/i;
  const SCHOOL_WORDS = /\b(university|college|institute|school|academy|polytechnic|conservatory|universidad|universit[eé])\b/i;
  const DEGREE_RE = /\b(bachelor'?s?|master'?s?|b\.?\s?s\.?c?|b\.?\s?a\.?|b\.?\s?eng|b\.?\s?tech|m\.?\s?s\.?c?|m\.?\s?a\.?|m\.?\s?eng|m\.?\s?tech|mba|ph\.?\s?d|doctor(ate)?|associate'?s?|diploma|high school|ged|j\.?d|m\.?d)\b\.?/i;
  const LOCATION_RE = /\b([A-Z][a-zA-Z.'-]+(?:\s[A-Z][a-zA-Z.'-]+){0,3}),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b(?:\s+(\d{5}(?:-\d{4})?))?/;
  const COMPANY_SUFFIX = /\b(inc|llc|ltd|corp|gmbh|plc|limited|co)\b\.?\s*$/i;
  const BULLET_RE =/^\s*[•●▪◦‣∙·*–-]\s*/;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function normDate(s) {
    if (!s) return '';
    const t = s.toLowerCase().replace(/\./g, '').trim();
    if (new RegExp(`^${PRESENT_RE}$`).test(t)) return 'present';
    let m = t.match(/^([a-z]+)\s*,?\s*(\d{4})$/);
    if (m) {
      const idx = MONTHS.indexOf(m[1].slice(0, 3));
      return idx >= 0 ? `${m[2]}-${String(idx + 1).padStart(2, '0')}` : m[2];
    }
    m = t.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{4})\s*[/-]\s*(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = t.match(/^(\d{4})$/);
    if (m) return m[1];
    return '';
  }

  // A bare year becomes YYYY-01 for starts and YYYY-12 for ends.
  const toMonth = (d, isEnd) => (/^\d{4}$/.test(d) ? `${d}-${isEnd ? '12' : '01'}` : d);

  function headingOf(line) {
    const t = line.toLowerCase().replace(/[:|_•\-–—]+$/g, '').replace(/^[^a-z]+/, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return null;
    for (const [name, re] of Object.entries(HEADINGS)) if (re.test(t)) return name;
    return null;
  }

  function splitSections(lines) {
    const sections = { header: [] };
    let current = 'header';
    for (const line of lines) {
      const h = headingOf(line);
      if (h) {
        current = h;
        sections[current] = sections[current] || [];
        continue;
      }
      (sections[current] = sections[current] || []).push(line);
    }
    return sections;
  }

  function findContacts(text) {
    const out = {};
    const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (email) out.email = email[0];
    const linkedin = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i);
    if (linkedin) out.linkedin = withScheme(linkedin[0]);
    const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i);
    if (github) out.github = withScheme(github[0]);
    const urls = text.match(/(?:https?:\/\/|www\.)[^\s,;|()<>]+|\b[\w-]+\.(?:dev|io|me|com|net|org|site|app|xyz|tech)(?:\/[^\s,;|()<>]*)?(?=[\s,;|]|$)/gi) || [];
    const portfolio = urls.find((u) => !/linkedin\.com|github\.com|@/i.test(u) && !(out.email && out.email.toLowerCase().endsWith(u.toLowerCase())));
    if (portfolio) out.portfolio = withScheme(portfolio.replace(/[.)]+$/, ''));
    const phoneCandidates = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d[\d\s.-]{6,14}\d/g) || [];
    const phone = phoneCandidates.find((p) => {
      const digits = p.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15 && !RANGE_RE.test(p) && !/^(19|20)\d{2}\D+(19|20)\d{2}$/.test(p.trim());
    });
    if (phone) out.phone = clean(phone);
    return out;
  }

  const withScheme = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, ''));

  function findName(headerLines) {
    for (const raw of headerLines.slice(0, 6)) {
      const line = clean(raw.split(/[|•·]/)[0]);
      if (!line || /[@\d]|https?:|www\./i.test(line)) continue;
      const words = line.split(' ');
      if (words.length < 2 || words.length > 4) continue;
      if (!words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'-]*$/.test(w))) continue;
      if (headingOf(line) || TITLE_WORDS.test(line)) continue;
      const cap = (w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w);
      const parts = words.map(cap);
      return {
        firstName: parts[0],
        middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
        lastName: parts[parts.length - 1],
      };
    }
    return {};
  }

  function findLocation(headerLines) {
    for (const raw of headerLines.slice(0, 8)) {
      for (const piece of raw.split(/[|•·]|\s{2,}/)) {
        if (/@|https?:|www\.|\d{3}.*\d{4}/.test(piece)) continue;
        const m = piece.match(LOCATION_RE);
        if (m) {
          const out = { city: m[1].trim() };
          if (/^[A-Z]{2}$/.test(m[2])) out.state = m[2];
          else out.country = m[2];
          if (m[3]) out.postalCode = m[3];
          return out;
        }
      }
    }
    return {};
  }

  function parseSkills(lines) {
    const skills = [];
    for (const raw of lines) {
      let line = raw.replace(BULLET_RE, '');
      const colon = line.indexOf(':');
      if (colon > 0 && colon < 40) line = line.slice(colon + 1);
      for (const s of line.split(/[,;|•·/]|\s{3,}|\t/)) {
        const t = clean(s).replace(/\.$/, '');
        if (t && t.length <= 40 && !skills.some((x) => x.toLowerCase() === t.toLowerCase())) skills.push(t);
      }
    }
    return skills;
  }

  // Split a header line into its parts (title, company, location).
  function headerPieces(text) {
    return text
      .split(/\s+[|•·@]\s+|\s+[-–—]\s+|\s{3,}|\t|,\s+(?=[A-Z][a-z]+,\s*[A-Z]{2}\b)/)
      .flatMap((p) => p.split(/\s+at\s+/i))
      .map(clean)
      .filter((p) => p && p !== ',');
  }

  function assignHeader(entry, pieces) {
    for (const p of pieces) {
      if (!entry.location && LOCATION_RE.test(p) && !TITLE_WORDS.test(p) && p.split(' ').length <= 5 && /,/.test(p)) {
        entry.location = p;
      } else if (!entry.location && /^(remote|hybrid|on-?site)$/i.test(p)) {
        entry.location = p;
      } else if (!entry.title && TITLE_WORDS.test(p) && !COMPANY_SUFFIX.test(p)) {
        entry.title = p;
      } else if (!entry.company) {
        entry.company = p.replace(/,$/, '');
      } else if (!entry.title) {
        entry.title = p;
      }
    }
  }

  function parseExperience(lines) {
    const entries = [];
    let pending = []; // non-bullet lines seen since the last entry header
    let entry = null;
    for (const raw of lines) {
      const line = clean(raw);
      if (!line) continue;
      const isBullet = BULLET_RE.test(raw);
      const range = !isBullet && line.match(RANGE_RE);
      if (range) {
        entry = { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' };
        const end = normDate(range[2]);
        entry.startDate = toMonth(normDate(range[1]), false);
        entry.current = end === 'present';
        entry.endDate = entry.current ? '' : toMonth(end, true);
        const rest = clean(line.replace(range[0], ' ').replace(/[(),|–—-]\s*$/, '').replace(/\(\s*\)/, ''));
        // Header lines usually sit right above the dates; keep at most two.
        const above = pending.slice(-2);
        assignHeader(entry, [...above.flatMap(headerPieces), ...headerPieces(rest)]);
        entries.push(entry);
        pending = [];
      } else if (isBullet || (entry && pending.length === 0 && line.length > 90)) {
        if (entry) entry.description += (entry.description ? '\n' : '') + '• ' + line.replace(BULLET_RE, '');
        pending = [];
      } else {
        pending.push(line);
        // A long plain line after a header is probably description prose.
        if (entry && line.length > 60 && pending.length === 1 && !TITLE_WORDS.test(line)) {
          entry.description += (entry.description ? '\n' : '') + line;
          pending = [];
        }
      }
    }
    return entries;
  }

  function parseEducation(lines) {
    const entries = [];
    let cur = null;
    const start = () => {
      cur = { school: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' };
      entries.push(cur);
    };
    for (const raw of lines) {
      const line = clean(raw.replace(BULLET_RE, ''));
      if (!line) continue;
      let rest = line;
      const range = rest.match(RANGE_RE);
      const gpa = rest.match(/\bGPA[:\s]*([0-4]\.\d{1,2})(?:\s*\/\s*[0-9.]+)?/i) || rest.match(/\b([0-4]\.\d{1,2})\s*\/\s*4(?:\.0+)?\b/);
      const school = findSchool(rest);
      const degree = rest.match(DEGREE_RE);
      if ((school && (!cur || cur.school)) || (degree && !school && cur && cur.degree)) start();
      if (!cur && (degree || range)) start();
      if (!cur) continue;
      if (school && !cur.school) cur.school = school;
      if (degree && !cur.degree) {
        cur.degree = degreeName(degree[0]);
        const after = rest.slice(rest.search(DEGREE_RE));
        const fieldMatch = after.match(/\b(?:of\s+(?:science|arts|engineering|business administration)\s+)?(?:in|of)\s+([A-Za-z&,' ]{2,60}?)(?=\s*(?:[|•·,(]|\s[-–—]\s|\d|$))/i);
        if (fieldMatch) cur.field = clean(fieldMatch[1]);
        else {
          // "Bachelor's Degree, Graphic Design"
          const tail = after.replace(DEGREE_RE, '').match(/^\s*(?:degree)?\s*[,:–-]\s*([A-Za-z&' ]{2,60})/i);
          if (tail && !SCHOOL_WORDS.test(tail[1])) cur.field = clean(tail[1]);
        }
      }
      if (gpa && !cur.gpa) cur.gpa = gpa[1];
      if (range) {
        cur.startDate = toMonth(normDate(range[1]), false);
        const end = normDate(range[2]);
        cur.endDate = end === 'present' ? '' : toMonth(end, true);
      } else if (!cur.endDate) {
        const single = rest.match(SINGLE_DATE_RE);
        if (single && (degree || school || /expected|graduat|class of/i.test(rest))) cur.endDate = toMonth(normDate(single[1]), true);
      }
    }
    return entries.filter((e) => e.school || e.degree);
  }

  // "University of California, Berkeley" keeps its campus; dates and degree
  // text sharing the line are dropped.
  function findSchool(line) {
    let piece = line.split(/\s+[|•·]\s+|\s+[-–—]\s+|\s{3,}|\t/).find((p) => SCHOOL_WORDS.test(p));
    if (!piece) return null;
    piece = piece.replace(RANGE_RE, '').replace(/\(?\b(19|20)\d{2}\b\)?/g, '');
    const parts = piece.split(/,\s*/).map(clean).filter(Boolean);
    const i = parts.findIndex((p) => SCHOOL_WORDS.test(p));
    const keep = [parts[i]];
    const next = parts[i + 1];
    if (next && !DEGREE_RE.test(next) && !/\d|gpa/i.test(next) && next.split(' ').length <= 3 && !/^[A-Z]{2}$/.test(next)) keep.push(next);
    return keep.join(', ');
  }

  function degreeName(raw) {
    const t = raw.toLowerCase().replace(/[.\s']/g, '');
    if (/^(bachelors?|bsc?|ba|beng|btech)$/.test(t)) return "Bachelor's";
    if (/^(masters?|msc?|ma|meng|mtech)$/.test(t)) return "Master's";
    if (t === 'mba') return 'MBA';
    if (/^(phd|doctor|doctorate)$/.test(t)) return 'PhD';
    if (/^associates?$/.test(t)) return 'Associate';
    if (t === 'highschool' || t === 'ged') return 'High School';
    if (t === 'jd') return 'JD';
    if (t === 'md') return 'MD';
    return 'Other';
  }

  function yearsOfExperience(work, now = new Date()) {
    const toN = (ym) => {
      const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
      return m ? +m[1] * 12 + (+m[2] - 1) : null;
    };
    const nowN = now.getFullYear() * 12 + now.getMonth();
    const spans = work
      .map((w) => [toN(w.startDate), w.current ? nowN : toN(w.endDate)])
      .filter(([a, b]) => a != null && b != null && b >= a)
      .sort((x, y) => x[0] - y[0]);
    let total = 0;
    let [cs, ce] = [null, null];
    for (const [a, b] of spans) {
      if (cs == null || a > ce) {
        if (cs != null) total += ce - cs;
        [cs, ce] = [a, b];
      } else ce = Math.max(ce, b);
    }
    if (cs != null) total += ce - cs;
    return total ? String(Math.round(total / 12)) : '';
  }

  function parseText(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    const sections = splitSections(lines);
    const header = sections.header.length ? sections.header : lines.slice(0, 8);
    const personal = { ...findName(header), ...findLocation(header), ...findContacts(text) };
    const work = parseExperience(sections.experience || []);
    const education = parseEducation(sections.education || []);
    const skills = parseSkills(sections.skills || []);
    const summary = (sections.summary || []).map(clean).join(' ');
    const result = { personal, work, education, skills, summary };
    const years = yearsOfExperience(work);
    if (years) result.preferences = { yearsExperience: years };
    if (work[0] && work[0].title) result.preferences = { ...(result.preferences || {}), desiredTitle: work[0].title };
    return result;
  }

  // Merge parsed data into a profile. By default only empty fields are filled.
  function mergeIntoProfile(profile, parsed, { overwrite = false } = {}) {
    const p = JSON.parse(JSON.stringify(profile));
    for (const section of ['personal', 'preferences']) {
      for (const [k, v] of Object.entries(parsed[section] || {})) {
        if (v && (overwrite || !p[section][k])) p[section][k] = v;
      }
    }
    for (const list of ['work', 'education']) {
      const items = parsed[list] || [];
      if (items.length && (overwrite || !p[list].length)) p[list] = items;
    }
    if (parsed.skills && parsed.skills.length) {
      const have = new Set(p.skills.map((s) => s.toLowerCase()));
      p.skills = overwrite ? parsed.skills.slice() : p.skills.concat(parsed.skills.filter((s) => !have.has(s.toLowerCase())));
    }
    if (parsed.summary && (overwrite || !p.summary)) p.summary = parsed.summary;
    return p;
  }

  JF.resumeParse = { parseText, mergeIntoProfile, normDate, yearsOfExperience, headingOf };
})();
