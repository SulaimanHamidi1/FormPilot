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
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: {
      sendMessage: async (msg) => {
        console.log('[shim] sendMessage', msg);
        // Stand-in for the service worker on single-frame test pages.
        if (msg.type === 'fillAnswers') return { ok: true, filled: await window.JF.fillAnswers(msg.answers) };
        return { ok: true };
      },
      openOptionsPage: () => {},
      getURL: (p) => '/' + p,
      onMessage: { addListener: () => {} },
    },
  });
})();
