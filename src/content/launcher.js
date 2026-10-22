// Floating job_filler button on the right edge of pages that look like a job
// application. Registered by the service worker only when the user turns it on
// in Settings. It is small and standalone: the filler itself is still injected
// only when the button (or the popup/shortcut) is used.
(() => {
  if (globalThis.JFLauncher) return;

  const HOST_ATTR = 'data-jf-ui';
  const HIDDEN_KEY = 'launcherHidden';
  const CHECK_DELAY = 1000;
  const WATCH_FOR = 3 * 60 * 1000;

  const CONTROLS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea';
  const HINT_ATTRS = ['name', 'id', 'placeholder', 'aria-label', 'autocomplete', 'data-automation-id', 'data-qa'];
  const HINT_RE = /resume|\bcv\b|first.?name|last.?name|full.?name|given.?name|family.?name|e-?mail|phone|linkedin|cover.?letter/i;
  const ATS_FRAME_RE = /greenhouse|lever\.co|ashbyhq|workday|smartrecruiters|icims|jobvite|workable|bamboohr|taleo|successfactors|breezy|recruitee|teamtailor|applytojob/i;

  const visible = (el) => el.getClientRects().length > 0;

  // Light DOM controls plus those in open shadow roots (SmartRecruiters).
  function controls(doc) {
    const out = [...doc.querySelectorAll(CONTROLS)];
    if (out.length >= 3) return out;
    const all = doc.querySelectorAll('*');
    if (all.length > 5000) return out;
    for (const el of all) if (el.shadowRoot) out.push(...controls(el.shadowRoot));
    return out;
  }

  // A page looks like an application when it has a few visible fields, some of
  // them asking for a name, email, phone or resume, and no password field
  // (sign-in and sign-up pages). Forms embedded from an ATS count too.
  function looksLikeApplication(doc = document) {
    for (const f of doc.querySelectorAll('iframe')) {
      if (ATS_FRAME_RE.test((f.src || '') + ' ' + f.id + ' ' + f.name) && visible(f)) return true;
    }
    let fields = 0;
    let hints = 0;
    for (const el of controls(doc)) {
      if (el.type === 'password' && visible(el)) return false;
      const isFile = el.type === 'file';
      // File inputs are usually hidden behind an "Attach" button.
      if (!isFile && !visible(el)) continue;
      fields++;
      if (isFile || el.type === 'email' || el.type === 'tel') hints++;
      else if (HINT_ATTRS.some((a) => HINT_RE.test(el.getAttribute(a) || ''))) hints++;
      else if (el.labels && [...el.labels].some((l) => HINT_RE.test(l.textContent))) hints++;
    }
    return fields >= 3 && hints >= 2;
  }

  const LOGO = '<svg viewBox="0 0 128 128" aria-hidden="true"><defs>'
    + '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#4338CA"/></linearGradient>'
    + '<linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FCD34D"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>'
    + '<rect x="4" y="4" width="120" height="120" rx="28" fill="url(#bg)"/>'
    + '<rect x="26" y="20" width="62" height="82" rx="10" fill="#fff"/>'
    + '<rect x="35" y="31" width="20" height="5" rx="2.5" fill="#A5B4FC"/><rect x="35" y="39" width="44" height="9" rx="4.5" fill="#2563EB"/>'
    + '<rect x="35" y="55" width="16" height="5" rx="2.5" fill="#A5B4FC"/><rect x="35" y="63" width="44" height="9" rx="4.5" fill="#2563EB"/>'
    + '<rect x="35" y="79" width="24" height="5" rx="2.5" fill="#A5B4FC"/><rect x="35" y="87" width="22" height="5" rx="2.5" fill="#C7D2FE"/>'
    + '<circle cx="90" cy="90" r="25" fill="#4338CA"/><circle cx="90" cy="90" r="20" fill="url(#bolt)"/>'
    + '<path d="M93.5 73.5 L79.5 92.5 H89 L86.5 106.5 L100.5 87.5 H91 Z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  const STYLE = `
    :host { all: initial; }
    .tab {
      position: fixed; top: 50%; right: 0; z-index: 2147483646;
      transform: translate(10px, -50%); transition: transform .15s ease;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      font: 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .tab:hover, .tab:focus-within { transform: translate(0, -50%); }
    .go {
      all: unset; cursor: pointer; display: block; width: 44px; height: 44px; padding: 4px 14px 4px 4px;
      background: #fff; border-radius: 14px 0 0 14px; box-shadow: -2px 2px 12px rgb(0 0 0 / .22);
    }
    .go svg { width: 44px; height: 44px; display: block; }
    .go:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .go.busy svg { animation: pulse .8s ease-in-out infinite alternate; }
    @keyframes pulse { to { opacity: .45; } }
    .hide {
      all: unset; cursor: pointer; visibility: hidden; margin-right: 10px;
      width: 18px; height: 18px; border-radius: 50%; text-align: center; line-height: 18px;
      background: #1f2328; color: #fff; font-size: 13px;
    }
    .tab:hover .hide, .hide:focus-visible { visibility: visible; }
    @media (prefers-color-scheme: dark) { .go { background: #1d2127; } }
  `;

  let host = null;

  function show() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="tab">`
      + '<button class="hide" title="Don\'t show on this site" aria-label="Don\'t show the job_filler button on this site">×</button>'
      + `<button class="go" title="Fill this application (job_filler)" aria-label="Fill this application with job_filler">${LOGO}</button></div>`;
    const go = root.querySelector('.go');
    go.addEventListener('click', () => fill(go));
    root.querySelector('.hide').addEventListener('click', hideOnSite);
    document.documentElement.append(host);
  }

  function remove() {
    if (host) host.remove();
    host = null;
  }

  async function fill(btn) {
    // After the extension is reloaded this copy of the script is orphaned.
    if (!chrome.runtime || !chrome.runtime.id) return remove();
    btn.classList.add('busy');
    try {
      await chrome.runtime.sendMessage({ type: 'fill' });
    } catch {
      remove();
    }
    setTimeout(() => btn.classList.remove('busy'), 1200);
  }

  async function hideOnSite() {
    remove();
    stop();
    try {
      const { [HIDDEN_KEY]: list = [] } = await chrome.storage.local.get(HIDDEN_KEY);
      if (!list.includes(location.hostname)) await chrome.storage.local.set({ [HIDDEN_KEY]: [...list, location.hostname] });
    } catch {}
  }

  // Single-page apps (Workday, Greenhouse's new boards) render the form late,
  // so keep checking on DOM changes for a while, then give up.
  let observer = null;
  let timer = 0;
  let deadline = 0;

  function check() {
    timer = 0;
    if (looksLikeApplication()) {
      show();
      stop();
    } else if (Date.now() > deadline) {
      stop();
    }
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(timer);
  }

  async function start() {
    let hidden = [];
    try {
      ({ [HIDDEN_KEY]: hidden = [] } = await chrome.storage.local.get(HIDDEN_KEY));
    } catch {}
    if (hidden.includes(location.hostname)) return;
    deadline = Date.now() + WATCH_FOR;
    check();
    if (host) return;
    observer = new MutationObserver(() => {
      if (!timer) timer = setTimeout(check, CHECK_DELAY);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  globalThis.JFLauncher = { looksLikeApplication, show, remove };
  if (!globalThis.JF_LAUNCHER_MANUAL) start();
})();
