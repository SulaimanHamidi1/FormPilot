// Content-script entry point. Injected on demand by the service worker into
// every frame of the active tab; nothing runs until the user triggers it.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.ready) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Matches that still need the user, kept so answers can be filled in later.
  const pending = new Map();

  async function analyze() {
    const profile = await JF.storage.getProfile();
    const fields = JF.detect.scan(document);
    return { profile, fields, matches: JF.match.matchAll(fields, profile) };
  }

  // Which leftover fields are worth asking the user about.
  function needsAnswer(m, status, ignored) {
    const f = m.field;
    const q = JF.match.questionText(f);
    if (m.skip || !q || q.length < 2 || q.length > 500) return false;
    if (ignored.has(JF.text.normalize(q))) return false;
    if (status === 'kept' || status === 'filled') return false;
    if (f.kind === 'file' && m.key !== 'resume') return false;
    if (f.kind === 'checkbox' && !f.required) return false;
    if (m.key || m.custom) return f.required || status === 'failed';
    // Unmatched: ask about real questions, not optional one-liners like "Facebook".
    const hasChoices = ['select', 'radio', 'checkboxGroup', 'buttonGroup', 'combobox', 'listbox'].includes(f.kind);
    return f.required || hasChoices || f.kind === 'textarea' || /\?\s*$/.test(q) || q.length > 30;
  }

  function describe(m, frameKey) {
    const f = m.field;
    return {
      id: f.id,
      frameKey,
      question: JF.match.questionText(f),
      kind: f.kind,
      key: m.key || null,
      required: !!f.required,
      options: (f.options || []).map((o) => o.text).filter(Boolean).slice(0, 60),
    };
  }

  JF.run = async ({ frameKey = '' } = {}) => {
    const t0 = performance.now();
    const settings = await JF.storage.getSettings();
    let resumePromise;
    const ctx = { settings, getResume: () => (resumePromise = resumePromise || JF.storage.getResume()) };

    const ignored = new Set(settings.ignored || []);
    const seen = new Set();
    const counts = { filled: 0, kept: 0, failed: 0 };
    pending.clear();
    // Two passes: answers can reveal follow-up fields (e.g. country -> state).
    for (let pass = 0; pass < 2; pass++) {
      const { profile, matches } = await analyze();
      ctx.profile = profile;
      const fresh = matches.filter((m) => !seen.has(m.field.el));
      if (!fresh.length) break;
      fresh.forEach((m) => seen.add(m.field.el));
      const res = await JF.fill.fillAll(fresh, ctx);
      const statusOf = new Map();
      for (const [status, list] of Object.entries(res)) list.forEach((m) => statusOf.set(m, status));
      counts.filled += res.filled.length;
      counts.kept += res.kept.length;
      counts.failed += res.failed.length;
      for (const m of fresh) {
        if (needsAnswer(m, statusOf.get(m), ignored)) {
          pending.set(m.field.id, m);
          if (settings.highlight) JF.fill.highlight(m.field.el, JF.fill.WARN_COLOR);
        }
      }
      if (!res.filled.length) break;
      await sleep(300);
    }
    // JF_FORCE_WATCH lets the local test pages exercise this; page scripts
    // can't reach the content script's isolated world in the extension.
    if (settings.watchMultiStep && (MULTI_STEP.test(location.hostname) || globalThis.JF_FORCE_WATCH)) watch();
    return {
      url: location.href,
      top: window === window.top,
      filled: counts.filled,
      kept: counts.kept,
      failed: counts.failed,
      unknown: [...pending.values()].map((m) => describe(m, frameKey)),
      ms: Math.round(performance.now() - t0),
    };
  };

  // Multi-step applications (Workday, iCIMS, ...) swap in a new step without a
  // page load. After the user fills once, watch for the next step's fields and
  // fill them too. Event-driven and debounced; stops after 30 minutes.
  const MULTI_STEP = /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|workday\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|jobvite\.com)$/;
  let observer = null;
  let running = false;

  function watch() {
    if (observer) return;
    let timer = null;
    let quietUntil = performance.now() + 1500;
    observer = new MutationObserver(() => {
      if (running || performance.now() < quietUntil) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        // Only act when a new step has unfilled fields we can answer.
        const { matches } = await analyze();
        const fresh = matches.filter((m) => (m.key || m.custom) && m.value && !m.field.el.hasAttribute(JF.fill.FILLED_ATTR) && !JF.fill.hasValue(m.field));
        if (fresh.length < 2) return;
        running = true;
        try {
          const res = await JF.run();
          if (window === window.top) JF.showSummary({ ...res, unknown: res.unknown.map((u) => ({ ...u, frameId: 0 })) });
        } finally {
          running = false;
          quietUntil = performance.now() + 1500;
        }
      }, 900);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); observer = null; }, 30 * 60 * 1000);
  }

  // Fill answers the user just gave for pending fields in this frame.
  JF.fillAnswers = async (answers) => {
    const settings = await JF.storage.getSettings();
    const profile = await JF.storage.getProfile();
    const ctx = { settings: { ...settings, overwrite: true }, profile, getResume: () => JF.storage.getResume() };
    let filled = 0;
    for (const { id, value } of answers) {
      const m = pending.get(id);
      if (!m || !m.field.el.isConnected) continue;
      const status = await JF.fill.fillOne({ ...m, value }, ctx);
      if (status === 'filled') {
        filled++;
        pending.delete(id);
      }
    }
    return filled;
  };

  // Summary for the whole tab (all frames), shown in the top frame.
  JF.showSummary = (s) => {
    const parts = [`Filled ${s.filled} field${s.filled === 1 ? '' : 's'}`];
    if (s.kept) parts.push(`kept ${s.kept} you'd already entered`);
    if (s.unknown.length) parts.push(`${s.unknown.length} need${s.unknown.length === 1 ? 's' : ''} your answer`);
    JF.ui.toast(parts.join(' · ') + '. Review before submitting.', { warn: !s.filled || s.unknown.length > 0, ms: 6000 });
  };

  // Scroll a pending field into view (top frame only).
  JF.focusPending = (item) => {
    const m = item.frameId === 0 || item.frameId == null ? pending.get(item.id) : null;
    if (!m || !m.field.el.isConnected) return;
    m.field.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    m.field.el.focus({ preventScroll: true });
  };

  JF.analyze = analyze;
  JF.ready = true;
})();
