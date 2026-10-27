// Repeating sections (Workday and others) can start with only an "Add"
// button. Click it until there is a block for each saved job, school and
// project, so the normal fill can fill them. Exposes JF.expand.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.expand) return;

  const MAX = 10;
  const CLICKABLE = 'button, [role=button], a';
  const ADD_RE = /^\+?\s*add\b(?!\s+(to|from)\b)/i;
  const SECTION_WORDS = {
    work: /\b(work|professional|employment|job)\s*(experience|history)\b|^(work\s+)?experience$|\bemployment\b/i,
    education: /\beducation\b|\bschools?\b/i,
    projects: /\bprojects?\b(?!\s+manag)/i,
  };
  // Profile entries worth a block of their own.
  const WANTED = {
    work: (w) => w.company || w.title,
    education: (e) => e.school || e.degree,
    projects: (p) => p.name,
  };
  const HEADING = 'h1, h2, h3, h4, h5, h6, legend, [role=heading]';

  const clean = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function sectionFromText(t) {
    if (!t || t.length > 80) return null;
    if (SECTION_WORDS.education.test(t)) return 'education';
    if (SECTION_WORDS.projects.test(t)) return 'projects';
    if (SECTION_WORDS.work.test(t)) return 'work';
    return null;
  }

  // Which list an Add button adds to: its own label ("Add Work Experience"),
  // else the nearest heading or labelled group around it. The first heading
  // found decides, so "Certifications" never borrows a form-wide name.
  function sectionOfButton(btn) {
    const own = clean(btn.getAttribute('aria-label') || btn.textContent).replace(/^\+?\s*add(\s+another|\s+new|\s+more)?\s*/i, '');
    if (own) return sectionFromText(own);
    for (let node = btn.parentElement, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      let head = null;
      for (const h of node.querySelectorAll(HEADING)) {
        if (h.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) head = h;
      }
      const labelledBy = (node.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean);
      const texts = [head && head.textContent, ...labelledBy.map((l) => l.textContent), node.getAttribute('aria-label')].filter(Boolean);
      if (texts.length) return sectionFromText(clean(texts[0]));
      const attr = sectionFromText(clean(node.getAttribute('data-automation-id') || ''));
      if (attr) return attr;
    }
    return null;
  }

  // Visible Add buttons that can't submit a form.
  function addButtons(doc = document) {
    const out = [];
    for (const el of doc.querySelectorAll(CLICKABLE)) {
      if (el.closest('[' + JF.detect.HOST_ATTR + ']')) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (el.tagName === 'BUTTON' && el.form && (el.getAttribute('type') || 'submit') === 'submit') continue;
      if (el.tagName === 'A' && el.getAttribute('href') && !/^(#|javascript:)/i.test(el.getAttribute('href'))) continue;
      const text = clean(el.textContent || el.getAttribute('aria-label'));
      if (text.length > 40 || !ADD_RE.test(text)) continue;
      if (!JF.detect.isVisible(el)) continue;
      out.push(el);
    }
    return out;
  }

  // How many blocks of a list are on the page, judged by the fields matched
  // to it (work.company in block 0 and 1 -> 2).
  function blocksOf(list, profile) {
    const matches = JF.match.matchAll(JF.detect.scan(document), profile);
    let n = 0;
    for (const m of matches) if (m.key && m.key.startsWith(list + '.')) n = Math.max(n, m.index + 1);
    return n;
  }

  async function waitFor(test, ms, shouldStop) {
    const end = performance.now() + ms;
    while (performance.now() < end && !shouldStop()) {
      await sleep(100);
      if (test()) return true;
    }
    return false;
  }

  // Returns the number of blocks added.
  async function run(profile, { follow = false, shouldStop = () => false } = {}) {
    let added = 0;
    for (const list of ['work', 'education', 'projects']) {
      const wanted = Math.min(profile[list].filter(WANTED[list]).length, MAX);
      for (let i = 0; i < MAX && !shouldStop(); i++) {
        const before = blocksOf(list, profile);
        if (before >= wanted) break;
        const btn = addButtons().find((b) => sectionOfButton(b) === list);
        if (!btn) break;
        if (follow) await JF.fill.follow(btn);
        if (shouldStop()) break;
        JF.fill.click(btn);
        // Stop if the site doesn't add a block (e.g. a limit was reached).
        if (!(await waitFor(() => blocksOf(list, profile) > before, 2500, shouldStop))) break;
        added++;
      }
    }
    return added;
  }

  JF.expand = { run, addButtons, sectionOfButton };
})();
