// The on-page button should appear on application forms and stay away from
// sign-in pages and ordinary pages.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadPage } = require('./helpers/dom');

const LAUNCHER = fs.readFileSync(path.join(__dirname, '..', 'src/content/launcher.js'), 'utf8');

function launcherIn(window) {
  window.JF_LAUNCHER_MANUAL = true;
  window.eval(LAUNCHER);
  return window.JFLauncher;
}

function fromHtml(html) {
  const { window } = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' });
  window.Element.prototype.getClientRects = function () {
    return window.getComputedStyle(this).display === 'none' ? [] : [{ width: 10, height: 10 }];
  };
  return window;
}

for (const name of ['generic', 'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'icims']) {
  test(`launcher detects the ${name} application form`, () => {
    const w = loadPage(`test/pages/forms/${name}.html`, { scripts: [] });
    assert.strictEqual(launcherIn(w).looksLikeApplication(w.document), true);
  });
}

test('launcher uses label text as a hint', () => {
  const w = fromHtml('<label for="a">First name</label><input id="a"><label for="b">Phone number</label><input id="b"><label for="c">Website</label><input id="c">');
  assert.strictEqual(launcherIn(w).looksLikeApplication(w.document), true);
});

test('launcher ignores sign-in pages', () => {
  const w = fromHtml('<form><input type="email" name="email"><input type="password" name="password"><input name="first_name"><button>Sign in</button></form>');
  assert.strictEqual(launcherIn(w).looksLikeApplication(w.document), false);
});

test('launcher ignores pages without application fields', () => {
  const w = fromHtml('<article><h1>Blog</h1><input type="search" name="q"><input name="newsletter"><select name="sort"></select></article>');
  assert.strictEqual(launcherIn(w).looksLikeApplication(w.document), false);
});

test('launcher shows a single button that the filler skips', () => {
  const w = fromHtml('<p>x</p>');
  const L = launcherIn(w);
  L.show();
  L.show();
  const hosts = w.document.querySelectorAll('[data-jf-ui]');
  assert.strictEqual(hosts.length, 1);
  assert.ok(hosts[0].shadowRoot.querySelector('button.go svg'));
  L.remove();
  assert.strictEqual(w.document.querySelectorAll('[data-jf-ui]').length, 0);
});

function filledLauncher() {
  const { CONTENT } = require('./helpers/dom');
  const { createChromeMock } = require('./helpers/chrome-mock');
  const w = loadPage('test/pages/forms/generic.html', { scripts: [] });
  w.chrome = createChromeMock();
  w.chrome.runtime = { id: 'test', sendMessage: async () => ({ ok: true }) };
  for (const s of [...CONTENT, 'src/shared/storage.js', 'src/content/main.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', s), 'utf8'));
  const L = launcherIn(w);
  L.show();
  const root = w.document.querySelector('[data-jf-ui]').shadowRoot;
  return { w, L, tab: root.querySelector('.tab'), go: root.querySelector('.go') };
}

test('launcher turns into the Stop button while filling', async () => {
  const { w, tab, go } = filledLauncher();
  await w.chrome.storage.local.set({ profile: require('./fixtures/profile.json') });
  const sent = [];
  w.chrome.runtime.sendMessage = async (msg) => { sent.push(msg.type); return { ok: true }; };
  let wasFilling = false;
  w.document.querySelector('#fn').addEventListener('input', () => {
    wasFilling = tab.classList.contains('filling');
    go.click();
  }, { once: true });
  const res = await w.JF.run();
  assert.ok(wasFilling, 'icon shows Stop during the fill');
  assert.strictEqual(w.JF.ui.wrap().querySelector('.stopbar'), null, 'no separate Stop bar');
  assert.strictEqual(res.stopped, true);
  assert.deepStrictEqual(sent, ['stop'], 'clicking while filling stops instead of filling again');
  assert.strictEqual(w.document.querySelector('input[name=email]').value, '');
  w.JF.showSummary(res);
  assert.ok(!tab.classList.contains('filling'));
  assert.match(go.title, /Fill this application/);
});

test('launcher can be dragged to the left edge and remembers it', async () => {
  const { w, tab, go } = filledLauncher();
  const sent = [];
  w.chrome.runtime.sendMessage = async (msg) => { sent.push(msg.type); return { ok: true }; };
  const ev = (type, x, y) => go.dispatchEvent(new w.PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }));
  ev('pointerdown', 1000, 380);
  ev('pointermove', 600, 300);
  ev('pointermove', 50, 192);
  assert.ok(tab.classList.contains('dragging'));
  ev('pointerup', 50, 192);
  go.click();
  assert.ok(tab.classList.contains('left'));
  assert.strictEqual(tab.style.getPropertyValue('--y'), '25.00%');
  assert.deepStrictEqual(sent, [], 'a drag is not a click');
  const { launcherPos } = await w.chrome.storage.local.get('launcherPos');
  assert.deepStrictEqual(launcherPos, { side: 'left', y: 0.25 });
  // A plain click still fills.
  ev('pointerdown', 10, 192);
  ev('pointerup', 10, 192);
  go.click();
  assert.deepStrictEqual(sent, ['fill']);
});
