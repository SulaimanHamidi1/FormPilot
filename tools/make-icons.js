// Renders the extension icons from icons/logo.svg (and icons/logo-16.svg for 16px).
// Run with: npm i --no-save @resvg/resvg-js && node tools/make-icons.js
const fs = require('fs');
const path = require('path');

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  console.error('Missing renderer. Run: npm i --no-save @resvg/resvg-js');
  process.exit(1);
}

const dir = path.join(__dirname, '..', 'icons');
const sources = { 16: 'logo-16.svg', 32: 'logo.svg', 48: 'logo.svg', 128: 'logo.svg' };

for (const [size, file] of Object.entries(sources)) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: Number(size) } }).render().asPng();
  fs.writeFileSync(path.join(dir, `icon${size}.png`), png);
}
console.log('icons written');
