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
