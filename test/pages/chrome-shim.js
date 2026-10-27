// Fake chrome.* APIs (localStorage-backed) so extension pages and content
// scripts can be exercised from a plain web page during development.
(() => {
  if (window.chrome && window.chrome.storage && window.chrome.storage.local) return;
  const KEY = '__jf_shim_store';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const listeners = [];
  const local = {
    async get(keys) {
      const s = read();
      if (keys == null) return s;
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in s) out[k] = s[k];
      return out;
    },
    async set(items) {
      const s = read();
      const changes = {};
      for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: s[k], newValue: v }; s[k] = v; }
      write(s);
      listeners.forEach((fn) => fn(changes, 'local'));
    },
    async remove(keys) { const s = read(); for (const k of [].concat(keys)) delete s[k]; write(s); },
    async clear() { write({}); },
  };
  window.chrome = Object.assign(window.chrome || {}, {
    // Every permission request is granted; grants live in the shim store.
    permissions: {
      async contains({ origins }) { const g = read().__granted || []; return origins.every((o) => g.includes(o) || g.includes('<all_urls>')); },
      async request({ origins }) { const s = read(); s.__granted = [...new Set([...(s.__granted || []), ...origins])]; write(s); return true; },
      async remove({ origins }) { const s = read(); s.__granted = (s.__granted || []).filter((o) => !origins.includes(o)); write(s); return true; },
    },
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: {
      id: 'formpilot-shim',
      sendMessage: async (msg) => {
        console.log('[shim] sendMessage', msg);
        // Stand-in for the service worker on single-frame test pages.
        if (msg.type === 'stop') return window.JF && window.JF.stop && window.JF.stop();
        if (msg.type === 'fillAnswers') return { ok: true, filled: await window.JF.fillAnswers(msg.answers) };
        if (msg.type === 'fill' && window.JF && window.JF.run) {
          window.JF.run().then((r) => window.JF.showSummary({ ...r, frames: 1, unknown: r.unknown.map((u) => ({ ...u, frameId: 0 })) }));
        }
        return { ok: true };
      },
      openOptionsPage: () => {},
      getURL: (p) => '/' + p,
      getManifest: () => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/manifest.json', false);
        xhr.send();
        return JSON.parse(xhr.responseText);
      },
      onMessage: { addListener: () => {} },
    },
  });
})();
