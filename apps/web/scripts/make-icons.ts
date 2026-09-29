/** Writes public/icons/icon-{192,512}.png (no image library): sun over a calm sea. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/icons');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const BG = [0x2f, 0x6f, 0x68];
const SUN = [0xf6, 0xe7, 0xc8];
const SEA = [0xf6, 0xf3, 0xee];

function color(x: number, y: number): number[] {
  // unit coords 0..1
  if ((x - 0.5) ** 2 + (y - 0.46) ** 2 < 0.17 ** 2 && y < 0.6) return SUN;
  const wave = (cy: number) => Math.abs(y - (cy + 0.018 * Math.sin(x * Math.PI * 4))) < 0.022;
  if (wave(0.66) || (wave(0.75) && x > 0.22 && x < 0.78)) return SEA;
  return BG;
}

function png(size: number) {
  const ss = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = color((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          for (let i = 0; i < 3; i++) acc[i] += c[i];
        }
      for (let i = 0; i < 3; i++) raw[y * (size * 3 + 1) + 1 + x * 3 + i] = Math.round(acc[i] / ss / ss);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const size of [192, 512]) writeFileSync(resolve(out, `icon-${size}.png`), png(size));
console.log('icons written');
