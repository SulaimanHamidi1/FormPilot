// Prints how each field on a test page is matched: node tools/debug-match.js <page>
const { loadPage } = require('../test/helpers/dom');
const profile = require('../test/fixtures/profile.json');
const w = loadPage(process.argv[2] || 'test/pages/forms/generic.html');
const fields = w.JF.detect.scan(w.document);
for (const m of w.JF.match.matchAll(fields, w.JF.schema.normalize(profile))) {
  const f = m.field;
  const q = (f.label || f.nearby || f.placeholder || '').slice(0, 60);
  const what = m.skip ? 'SKIP' : m.custom ? 'custom:' + m.custom.question : m.key || '-';
  console.log(`${f.kind.padEnd(13)} ${(f.attrs || '').slice(0, 28).padEnd(28)} ${q.padEnd(60)} -> ${what} ${m.score ? m.score.toFixed(2) : ''} ${f.section ? '[' + f.section + (f.index ?? '') + ']' : ''}`);
}
