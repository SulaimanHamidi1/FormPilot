// Loads an HTML page into jsdom and evaluates the content scripts in it.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = [
  'src/shared/schema.js',
  'src/shared/text.js',
  'src/content/synonyms.js',
  'src/content/detect.js',
  'src/content/match.js',
  'src/content/fill.js',
  'src/content/ui.js',
];

function loadPage(file, { scripts = CONTENT, runPageScripts = true } = {}) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dom = new JSDOM(html, { runScripts: runPageScripts ? 'dangerously' : 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  // jsdom has no layout: treat everything not display:none as visible.
  window.Element.prototype.getClientRects = function () {
    for (let el = this; el && el.nodeType === 1; el = el.parentElement || (el.getRootNode() && el.getRootNode().host)) {
      if (el.hidden || window.getComputedStyle(el).display === 'none') return [];
    }
    return [{ width: 10, height: 10 }];
  };
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) window.CSS.escape = (s) => String(s).replace(/(["\\]\[])/g, '\$1');
  for (const s of scripts) window.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
  return window;
}

module.exports = { loadPage, CONTENT };
