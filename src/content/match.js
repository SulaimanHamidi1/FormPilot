// Field -> profile matching. Exposes JF.match. Requires JF.text,
// JF.synonyms and JF.schema.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.match) return;
  const { normalize, normalizeAttr, tokens, tokenSim, containsPhrase, charSim } = JF.text;
  const { RULES, NEVER } = JF.synonyms;

  const THRESHOLD = 0.55;
  const CUSTOM_THRESHOLD = 0.72;
  const compact = (s) => s.replace(/ /g, '');
  const LIST_NAMES = Object.keys(JF.schema.LISTS);

  // Pre-normalise rule phrases once.
  const PREPARED = RULES.map((r) => ({
    ...r,
    phrases: r.phrases.map(normalize),
    attrs: (r.attrs || []).map(normalize),
    not: (r.not || []).map(normalize),
  }));

  function phraseScore(text, phrase) {
    if (!text || !phrase) return 0;
    if (text === phrase) return 1;
    const words = text.split(' ').length;
    if (containsPhrase(text, phrase) && (phrase.includes(' ') || phrase.length >= 6 || words <= 3)) {
      return 0.6 + 0.4 * Math.min(1, phrase.length / text.length);
    }
    if (phrase.includes(' ')) {
      const sim = tokenSim(text, phrase);
      if (sim >= 0.75) return 0.7 * sim;
    }
    return 0;
  }

  function attrScore(attrs, phrase) {
    if (!attrs || !phrase) return 0;
    if (attrs === phrase) return 0.95;
    if (containsPhrase(attrs, phrase)) return 0.6 + 0.3 * Math.min(1, phrase.length / attrs.length);
    const p = compact(phrase);
    if (p.length >= 5 && compact(attrs).includes(p)) return 0.65;
    return 0;
  }

  // A yes/no question ("Are you subject to ... with your current employer?")
  // only maps to keys that hold yes/no style answers.
  const YESNO_Q = /^(are|do|does|have|has|will|would|is|can|could|did|were|was|should)\b/;
  const YESNO_KEYS = new Set([
    'authorization.authorizedToWork', 'authorization.requireSponsorship', 'authorization.over18', 'authorization.securityClearance',
    'authorization.workAuthStatus', 'preferences.willingToRelocate', 'preferences.previouslyEmployed', 'preferences.remotePreference', 'work.current',
  ]);
  // Free-text boxes only take long-form answers.
  const TEXTAREA_KEYS = new Set(['summary', 'coverLetter', 'skills', 'work.description', 'projects.description', 'personal.address1']);

  // Normalised text signals for a field, strongest first.
  function signals(field) {
    const label = normalize(field.label);
    const nearby = normalize(field.nearby);
    return {
      label,
      nearby,
      placeholder: normalize(field.placeholder),
      attrs: normalizeAttr(field.attrs),
      yesNo: YESNO_Q.test(label || nearby) && /\?\s*\W*$/.test(field.label || field.nearby || ''),
    };
  }

  function ruleScore(rule, sig, field) {
    if (field.kind === 'textarea' && !TEXTAREA_KEYS.has(rule.key)) return 0;
    if (sig.yesNo && !YESNO_KEYS.has(rule.key) && !rule.key.startsWith('eeo.')) return 0;
    if (rule.kinds && !rule.kinds.includes(field.kind === 'checkboxGroup' ? 'checkbox' : field.kind)) return 0;
    if (!rule.kinds && field.kind === 'file') return 0;
    const listName = rule.key.split('.')[0];
    if ((rule.listOnly || rule.section) && field.section !== (rule.section || listName)) return 0;
    // List fields only apply in their own list's block (no job title in an
    // education block), and a project block only takes project fields.
    if (LIST_NAMES.includes(listName) && field.section && field.section !== listName) return 0;
    if (field.section === 'projects' && listName !== 'projects') return 0;
    const all = [sig.label, sig.nearby, sig.placeholder, sig.attrs];
    for (const n of rule.not) if (all.some((t) => t && containsPhrase(t, n))) return 0;
    if (field.autocomplete && rule.autocomplete && rule.autocomplete.some((a) => field.autocomplete.split(' ').includes(a))) return 1;
    let best = 0;
    for (const p of rule.phrases) {
      best = Math.max(best, phraseScore(sig.label, p), 0.9 * phraseScore(sig.nearby, p), 0.8 * phraseScore(sig.placeholder, p));
    }
    for (const a of rule.attrs) best = Math.max(best, 0.8 * attrScore(sig.attrs, a));
    return best;
  }

  function bestRule(field, sig) {
    let best = null;
    for (const rule of PREPARED) {
      const score = ruleScore(rule, sig, field);
      if (score > (best ? best.score : 0)) best = { key: rule.key, score };
    }
    return best && best.score >= THRESHOLD ? best : null;
  }

  // Question text used for custom Q&A matching and the unknown-field prompt.
  function questionText(field) {
    return field.label || field.nearby || field.placeholder || '';
  }

  function customScore(question, q) {
    const a = normalize(question);
    const b = normalize(q);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ta = tokens(a);
    const tb = tokens(b);
    let s = tokenSim(ta, tb);
    if (ta.length && tb.length && (containsPhrase(a, b) || containsPhrase(b, a))) s = Math.max(s, 0.85);
    if (a.length < 40 && b.length < 40) s = Math.max(s, charSim(a, b) * 0.95);
    return s;
  }

  function bestCustom(field, custom) {
    const q = questionText(field);
    if (!q || !custom || !custom.length) return null;
    let best = null;
    for (const c of custom) {
      if (c.answer === '') continue;
      const s = customScore(q, c.question);
      if (s > (best ? best.score : 0)) best = { custom: c, score: s };
    }
    return best && best.score >= CUSTOM_THRESHOLD ? best : null;
  }

  // ---- Values ----

  function valueFor(key, profile, index = 0) {
    const p = profile;
    const [section, field] = key.split('.');
    switch (key) {
      case 'personal.fullName':
        return [p.personal.firstName, p.personal.lastName].filter(Boolean).join(' ');
      case 'personal.location':
        return [p.personal.city, p.personal.state || p.personal.country].filter(Boolean).join(', ');
      case 'skills':
        return p.skills.join(', ');
      case 'summary':
        return p.summary;
      case 'coverLetter':
        return p.coverLetter;
      case 'resume':
        return 'resume';
      default:
        break;
    }
    if (LIST_NAMES.includes(section)) {
      const item = p[section][index];
      if (!item) return '';
      return field === 'current' ? item.current : item[field] || '';
    }
    if (section === 'preferences' && field === 'yearsExperience' && !p.preferences.yearsExperience && JF.resumeParse) {
      return JF.resumeParse.yearsOfExperience(p.work);
    }
    return p[section] && p[section][field] != null ? p[section][field] : '';
  }

  // Match every field. Returns [{field, key?, value?, custom?, score}].
  function matchAll(fields, profile) {
    const occurrences = {};
    // Index base per section: 1-based ids (workExperience-1) become 0-based.
    const minIndex = {};
    for (const f of fields) {
      if (f.section && f.index != null) minIndex[f.section] = Math.min(minIndex[f.section] ?? Infinity, f.index);
    }
    return fields.map((field) => {
      const q = normalize(questionText(field));
      if (NEVER.test(q) && field.kind !== 'file') return { field, skip: true };
      const sig = signals(field);
      const rule = bestRule(field, sig);
      const custom = bestCustom(field, profile.custom);
      // An explicitly saved answer for this exact question wins.
      if (custom && (!rule || custom.score >= 0.9 || custom.score > rule.score)) {
        return { field, custom: custom.custom, value: custom.custom.answer, score: custom.score };
      }
      if (!rule) return { field };
      let index = 0;
      const listName = rule.key.split('.')[0];
      if (LIST_NAMES.includes(listName) && field.section === listName) {
        if (field.index != null) index = field.index - (minIndex[listName] >= 1 ? minIndex[listName] : 0);
        else {
          // A split date (month + year) is one occurrence, counted per part.
          const slot = field.datePart ? rule.key + ':' + field.datePart : rule.key;
          index = occurrences[slot] || 0;
          occurrences[slot] = index + 1;
        }
      }
      const value = valueFor(rule.key, profile, index);
      return { field, key: rule.key, index, value, score: rule.score };
    });
  }

  // ---- Option matching (selects, radios, listboxes) ----

  const DECLINE_RE = /\b(decline|prefer not|dont wish|do not wish|not wish|dont want|do not want|choose not|rather not|not to (say|answer|disclose|self identify|identify)|no answer|undisclosed|not specified|i dont know)\b/;

  const ALIASES = {
    male: ['male', 'man', 'cisgender man'],
    female: ['female', 'woman', 'cisgender woman'],
    'non binary': ['non binary', 'nonbinary', 'genderqueer', 'gender non conforming'],
    'i am not a protected veteran': ['not a protected veteran', 'not a veteran', 'i am not a veteran', 'no'],
    'i identify as one or more of the classifications of protected veteran': ['identify as one or more', 'protected veteran', 'i am a veteran', 'yes'],
    'no i do not have a disability': ['no i do not have a disability', 'i do not have a disability', 'dont have a disability', 'no'],
    'yes i have a disability or previously had a disability': ['yes i have a disability', 'have a disability', 'yes'],
    'two or more races': ['two or more', 'multiracial', 'multiple'],
    'black or african american': ['black', 'african american'],
    'hispanic or latino': ['hispanic', 'latino', 'latinx', 'latina'],
    white: ['white', 'caucasian'],
    asian: ['asian'],
    'american indian or alaska native': ['american indian', 'alaska native', 'native american', 'indigenous'],
    'native hawaiian or other pacific islander': ['native hawaiian', 'pacific islander'],
    'united states': ['united states', 'united states of america', 'usa', 'us', 'u s', 'america'],
    'united kingdom': ['united kingdom', 'uk', 'great britain', 'england', 'britain'],
    bachelors: ['bachelor', 'bachelors', 'bachelor s', 'bs', 'ba', 'bsc', 'undergraduate', 'b s', 'b a'],
    masters: ['master', 'masters', 'master s', 'ms', 'ma', 'msc', 'm s', 'graduate degree'],
    phd: ['phd', 'ph d', 'doctorate', 'doctoral', 'doctor of philosophy'],
    associate: ['associate', 'associates', 'associate s'],
    'high school': ['high school', 'secondary', 'ged', 'diploma'],
    remote: ['remote', 'fully remote', 'work from home'],
    'on site': ['on site', 'onsite', 'in office', 'in person'],
  };

  const US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

  function aliasesFor(value) {
    const v = normalize(value);
    const out = new Set([v]);
    for (const [canon, list] of Object.entries(ALIASES)) {
      if (v === canon || list.includes(v)) {
        out.add(canon);
        list.forEach((x) => out.add(x));
      }
    }
    const up = String(value).trim().toUpperCase();
    if (US_STATES[up]) out.add(normalize(US_STATES[up]));
    // "San Francisco, CA" -> "san francisco california"
    const loc = String(value).match(/^(.+),\s*([A-Z]{2})$/);
    if (loc && US_STATES[loc[2]]) out.add(normalize(loc[1] + ' ' + US_STATES[loc[2]]));
    for (const [abbr, name] of Object.entries(US_STATES)) if (normalize(name) === v) out.add(abbr.toLowerCase());
    return [...out];
  }

  function optionScore(optText, candidates, isDecline) {
    const o = normalize(optText);
    if (!o) return 0;
    if (isDecline) return DECLINE_RE.test(o) ? 1 : 0;
    if (DECLINE_RE.test(o)) return 0;
    let best = 0;
    candidates.forEach((c, i) => {
      // The value itself counts more than its aliases.
      const w = i === 0 ? 1 : 0.92;
      let s = 0;
      if (o === c) s = 1;
      else if (c.length <= 3) {
        // Short answers (yes/no/us) must lead the option text.
        if (o.startsWith(c + ' ')) s = 0.85;
      } else if (containsPhrase(o, c)) s = 0.75 + 0.2 * (c.length / o.length);
      else if (containsPhrase(c, o) && o.length > 3) s = 0.7;
      else s = Math.max(tokenSim(o, c) * 0.85, charSim(o, c) * 0.8);
      best = Math.max(best, s * w);
    });
    return best;
  }

  const NEGATION_RE = /\b(not|no|dont|do not|wont|will not|cannot|cant|unable|never|neither|none)\b/;

  // Yes/No answers: match by polarity ("Yes, I am authorized" vs "No, ...").
  function pickYesNo(options, yes) {
    let best = null;
    for (const opt of options) {
      const o = normalize(opt.text || opt.value);
      if (!o || DECLINE_RE.test(o)) continue;
      let s;
      if (o === (yes ? 'yes' : 'no') || o === (yes ? 'true' : 'false') || o === (yes ? 'y' : 'n')) s = 1;
      else if (/^yes\b/.test(o)) s = yes ? 0.9 : 0;
      else if (/^no\b/.test(o)) s = yes ? 0 : 0.9;
      else s = NEGATION_RE.test(o) === !yes ? 0.6 : 0;
      if (s > (best ? best.score : 0)) best = { option: opt, score: s };
    }
    return best ? best.option : null;
  }

  // Numeric answers against range options: "3-5 years", "10+", "Less than 1".
  function pickRange(options, n) {
    for (const opt of options) {
      const t = normalize(opt.text).replace(/(\d)\s*k\b/g, '$1000');
      const nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
      if (!nums.length) continue;
      let lo = nums[0];
      let hi = nums.length > 1 ? nums[1] : nums[0];
      if (/\+|or more|and above|plus|over|more than|at least/.test(opt.text.toLowerCase())) hi = Infinity;
      if (/less than|under|fewer than|below|up to/.test(t)) [lo, hi] = [0, nums[0] - (/up to/.test(t) ? 0 : 0.001)];
      if (n >= lo && n <= hi) return opt;
    }
    return null;
  }

  // Pick the option that best represents `value`. Options: [{text, value}].
  function pickOption(options, value) {
    if (value == null || value === '' || !options.length) return null;
    const nv = normalize(value);
    if (nv === 'yes' || nv === 'no') return pickYesNo(options, nv === 'yes');
    if (/^\d+(\.\d+)?$/.test(String(value).trim())) {
      const r = pickRange(options, Number(value));
      if (r) return r;
    }
    const isDecline = DECLINE_RE.test(normalize(value));
    const candidates = isDecline ? [] : aliasesFor(value);
    let best = null;
    for (const opt of options) {
      const s = Math.max(optionScore(opt.text, candidates, isDecline), opt.value && !isDecline ? optionScore(opt.value, candidates, false) * 0.9 : 0);
      if (s > (best ? best.score : 0)) best = { option: opt, score: s };
    }
    return best && best.score >= 0.5 ? best.option : null;
  }

  JF.match = { matchAll, valueFor, pickOption, questionText, customScore, bestRule, signals, DECLINE_RE, US_STATES };
})();
