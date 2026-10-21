// Content-script entry point. Injected on demand by the service worker into
// every frame of the active tab; nothing runs until the user triggers it.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.ready) return;

  // Scan and match without touching the page.
  async function analyze() {
    const profile = await JF.storage.getProfile();
    const fields = JF.detect.scan(document);
    const matches = JF.match.matchAll(fields, profile);
    return { profile, fields, matches };
  }

  JF.run = async () => {
    const t0 = performance.now();
    const { matches } = await analyze();
    const matched = matches.filter((m) => (m.key || m.custom) && m.value !== '' && m.value != null);
    const unknown = matches.filter((m) => !m.skip && !m.key && !m.custom);
    return {
      url: location.href,
      top: window === window.top,
      fields: matches.length,
      matched: matched.length,
      unknown: unknown.length,
      filled: 0,
      ms: Math.round(performance.now() - t0),
    };
  };

  JF.analyze = analyze;
  JF.ready = true;
})();
