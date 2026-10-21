// Minimal in-memory chrome.storage.local mock for Node tests.
function createChromeMock() {
  let store = {};
  const listeners = [];
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const local = {
    async get(keys) {
      if (keys == null) return clone(store);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in store) out[k] = clone(store[k]);
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: store[k], newValue: clone(v) };
        store[k] = clone(v);
      }
      listeners.forEach((fn) => fn(changes, 'local'));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete store[k];
    },
    async clear() {
      store = {};
    },
  };
  return {
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
    _store: () => store,
  };
}
module.exports = { createChromeMock };
