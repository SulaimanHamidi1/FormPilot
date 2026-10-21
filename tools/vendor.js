// Copies the pdf.js legacy build (broadest Chromium support) used by the options page into lib/pdfjs.
// Run after `npm install`: node tools/vendor.js
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
const dest = path.join(__dirname, '..', 'lib', 'pdfjs');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['legacy/build/pdf.min.mjs', 'legacy/build/pdf.worker.min.mjs', 'LICENSE']) {
  fs.copyFileSync(path.join(src, f), path.join(dest, path.basename(f)));
}
const version = require(path.join(src, 'package.json')).version;
fs.writeFileSync(path.join(dest, 'VERSION'), version + '\n');
console.log('vendored pdfjs-dist', version);
