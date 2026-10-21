// Generates the extension icons (rounded square with a check mark) as PNGs.
// Run with: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Distance from point p to segment ab.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function makeIcon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size * 0.22;
  const stroke = size * 0.11;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      // Rounded-square coverage (1px soft edge).
      const qx = Math.max(r - cx, cx - (size - r), 0);
      const qy = Math.max(r - cy, cy - (size - r), 0);
      const d = Math.hypot(qx, qy) - r;
      const a = Math.max(0, Math.min(1, 0.5 - d));
      // Check mark.
      const s = size;
      const dc = Math.min(
        segDist(cx, cy, s * 0.27, s * 0.52, s * 0.44, s * 0.69),
        segDist(cx, cy, s * 0.44, s * 0.69, s * 0.75, s * 0.33)
      );
      const ca = Math.max(0, Math.min(1, stroke / 2 + 0.5 - dc));
      const bg = [37, 99, 235];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(bg[0] + (255 - bg[0]) * ca);
      raw[o + 1] = Math.round(bg[1] + (255 - bg[1]) * ca);
      raw[o + 2] = Math.round(bg[2] + (255 - bg[2]) * ca);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon${size}.png`), makeIcon(size));
}
console.log('icons written');
