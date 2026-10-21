// Builds a read-only probe for live ATS pages: detection + matching only, no
// filling. Paste the output into the devtools console of an application page.
// Usage: node tools/probe.js <outfile>
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const files = ['src/shared/schema.js', 'src/shared/text.js', 'src/content/synonyms.js', 'src/content/detect.js', 'src/content/match.js'];
const profile = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/profile.json'), 'utf8'));
const src = files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n') + `
;(() => {
  delete globalThis.JF_PROBE;
  const profile = JF.schema.normalize(${JSON.stringify(profile)});
  const docs = [document];
  for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch {} }
  const rows = [];
  for (const d of docs) {
    for (const m of JF.match.matchAll(JF.detect.scan(d), profile)) {
      const f = m.field;
      const q = (f.label || f.nearby || f.placeholder || '').slice(0, 70);
      const what = m.skip ? 'SKIP' : m.custom ? 'custom' : m.key || '-';
      rows.push([f.kind, (f.attrs || '').slice(0, 40), q, what, m.score ? +m.score.toFixed(2) : 0, f.section ? f.section + (f.index ?? '') : '', (f.options || []).slice(0, 4).map((o) => o.text.slice(0, 20)).join('/')].join(' | '));
    }
  }
  globalThis.JF_PROBE = rows;
  return rows;
})();`;
const out = esbuild.transformSync(src, { minify: true, target: 'chrome100' }).code;
fs.writeFileSync(process.argv[2] || path.join(root, 'probe.min.js'), out);
console.log('probe bytes', out.length);
