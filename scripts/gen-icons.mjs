// Generates Rally's PWA icons as PNGs with no dependencies (node:zlib only).
// Design: court-blue tile, white inset court lines, a ball-yellow ball with an ink outline.
// Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const COURT = [0x24, 0x53, 0xc7];
const BALL = [0xe6, 0xf5, 0x3d];
const INK = [0x16, 0x23, 0x3d];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Colour at a point in unit space (0..1), or null for transparent. */
function sample(x, y, { rounded, scale }) {
  // Rounded-square tile.
  if (rounded) {
    const r = 0.22;
    const dx = Math.max(r - x, 0, x - (1 - r));
    const dy = Math.max(r - y, 0, y - (1 - r));
    if (dx * dx + dy * dy > r * r) return null;
  }
  // Content is scaled around the centre (for maskable safe zone).
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  // Ball.
  const bx = u - 0.5;
  const by = v - 0.5;
  const d = Math.hypot(bx, by);
  const R = 0.2;
  if (d <= R + 0.028) {
    if (d > R) return INK;
    // Seams: two arcs (circles centred off to the sides).
    const seamL = Math.abs(Math.hypot(bx + 0.27, by) - 0.2);
    const seamR = Math.abs(Math.hypot(bx - 0.27, by) - 0.2);
    if (Math.min(seamL, seamR) < 0.014) return INK;
    return BALL;
  }
  // Court lines: inset border and centre line.
  const lw = 0.018;
  const inset = 0.17;
  const inBox = u > inset - lw && u < 1 - inset + lw && v > inset - lw && v < 1 - inset + lw;
  if (inBox) {
    const onEdge =
      Math.abs(u - inset) < lw || Math.abs(u - (1 - inset)) < lw || Math.abs(v - inset) < lw || Math.abs(v - (1 - inset)) < lw;
    if (onEdge) return WHITE;
    if (Math.abs(u - 0.5) < lw * 0.8) return WHITE;
  }
  return COURT;
}

function render(size, opts) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, opts);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const i = (py * size + px) * 4;
      const n = ss * ss;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, buf);
}

mkdirSync('public', { recursive: true });
const out = [
  ['public/pwa-192.png', 192, { rounded: true, scale: 1 }],
  ['public/pwa-512.png', 512, { rounded: true, scale: 1 }],
  ['public/pwa-512-maskable.png', 512, { rounded: false, scale: 0.8 }],
  ['public/apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
];
for (const [file, size, opts] of out) {
  writeFileSync(file, render(size, opts));
  console.log('wrote', file);
}
