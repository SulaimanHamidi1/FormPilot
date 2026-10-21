const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

globalThis.DOMParser = new JSDOM('').window.DOMParser;
require('../src/options/resume-extract.js');
require('../src/options/resume-parse.js');
const { resumeExtract, resumeParse } = globalThis.JF;
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('DOCX text extraction feeds the parser', async () => {
  const text = await resumeExtract.docxText(toArrayBuffer(fixture('resume-a.docx')));
  assert.match(text, /^JANE A\. DOE/);
  assert.match(text, /Software Engineer\tJun 2017/);
  const r = resumeParse.parseText(text);
  assert.strictEqual(r.personal.email, 'jane.doe@example.com');
  assert.strictEqual(r.work.length, 2);
  assert.strictEqual(r.work[1].title, 'Software Engineer');
});

test('PDF text extraction (pdf.js) feeds the parser', async () => {
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task = pdfjs.getDocument({ data: new Uint8Array(fixture('resume-a.pdf')), isEvalSupported: false });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = resumeExtract.itemsToLines(content.items);
  await task.destroy();
  assert.match(text, /• Mentored 4 engineers\./);
  const r = resumeParse.parseText(text);
  assert.strictEqual(r.personal.lastName, 'Doe');
  assert.strictEqual(r.work[0].company, 'Stripe');
  assert.strictEqual(r.education[0].degree, "Bachelor's");
  assert.ok(r.skills.includes('Kafka'));
});

test('kindOf detects file types', () => {
  assert.strictEqual(resumeExtract.kindOf({ name: 'cv.PDF', type: '' }), 'pdf');
  assert.strictEqual(resumeExtract.kindOf({ name: 'cv.docx', type: '' }), 'docx');
  assert.strictEqual(resumeExtract.kindOf({ name: 'cv.txt', type: 'text/plain' }), 'text');
  assert.strictEqual(resumeExtract.kindOf({ name: 'cv.doc', type: 'application/msword' }), null);
});
