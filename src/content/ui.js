// On-page UI in an isolated shadow root so site CSS can't touch it (and ours
// can't leak). Exposes JF.ui.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.ui) return;

  const STYLE = `
    :host { all: initial; }
    .wrap {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d0d7de;
      --accent: #2563eb; --accent-fg: #fff; --ok: #16a34a; --warn: #d97706;
      color-scheme: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .wrap { --bg: #1d2127; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --accent: #4c8dff; }
    }
    .toast, .panel {
      background: var(--bg); color: var(--fg); border: 1px solid var(--border);
      border-radius: 10px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    }
    .toast { padding: 10px 14px; display: flex; gap: 10px; align-items: center; max-width: 360px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); flex: none; }
    .dot.warn { background: var(--warn); }
    .dot.busy { background: var(--accent); animation: pulse .8s ease-in-out infinite alternate; }
    @keyframes pulse { to { opacity: .35; } }
    @media (prefers-reduced-motion: reduce) { .dot.busy { animation: none; } }
    button:disabled { cursor: default; opacity: .6; }
    button { font: inherit; cursor: pointer; border-radius: 6px; padding: 5px 10px; }
    button.primary { background: var(--accent); color: var(--accent-fg); border: 0; font-weight: 600; }
    button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    button.x { background: none; border: 0; color: var(--muted); padding: 2px 6px; font-size: 16px; line-height: 1; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  `;

  let host = null;
  let root = null;

  function ensureRoot() {
    if (host && host.isConnected) return root;
    host = document.createElement('div');
    host.setAttribute(JF.detect.HOST_ATTR, '');
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE + (JF.ui.extraStyle || '');
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    root.append(style, wrap);
    document.documentElement.append(host);
    return root;
  }

  const wrap = () => ensureRoot().querySelector('.wrap');

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  let toastTimer;
  function toast(message, { warn = false, ms = 4000 } = {}) {
    const w = wrap();
    w.querySelectorAll('.toast:not(.stopbar)').forEach((t) => t.remove());
    const t = el('div', { class: 'toast', role: 'status' },
      el('span', { class: 'dot' + (warn ? ' warn' : '') }),
      el('span', {}, message),
      el('button', { class: 'x', title: 'Dismiss', 'aria-label': 'Dismiss', onclick: () => t.remove() }, '×')
    );
    w.append(t);
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.remove(), ms);
  }

  // "Filling..." bar with a Stop button, shown in the top frame while a fill
  // runs. Stop halts this frame at once and asks the service worker to stop
  // every other frame of the tab.
  function showStop() {
    const w = wrap();
    if (w.querySelector('.stopbar')) return;
    const btn = el('button', {
      class: 'ghost', title: 'Stop filling this page',
      onclick: () => {
        btn.disabled = true;
        btn.textContent = 'Stopping…';
        if (JF.stop) JF.stop();
        try {
          if (chrome.runtime && chrome.runtime.id) chrome.runtime.sendMessage({ type: 'stop' }).catch(() => {});
        } catch {}
      },
    }, 'Stop');
    w.append(el('div', { class: 'toast stopbar', role: 'status' },
      el('span', { class: 'dot busy' }),
      el('span', {}, 'FormPilot is filling this page…'),
      btn
    ));
  }

  function hideStop() {
    if (host && host.isConnected) root.querySelectorAll('.stopbar').forEach((s) => s.remove());
  }

  function remove() {
    if (host) host.remove();
    host = root = null;
  }

  JF.ui = { toast, el, wrap, ensureRoot, remove, showStop, hideStop, extraStyle: '' };
})();
