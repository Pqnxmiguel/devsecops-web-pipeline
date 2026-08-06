/**
 * Genera `public/sprites/favicon.png`: recorte de 16x16 del frame `idle` del
 * mascot sprite, mismo encoder PNG mínimo que `generate-mascot-sprite.mjs`
 * (sin dependencias). Se mantiene como script separado y corto en vez de
 * factorizar un módulo compartido: es un one-off de build-time, no código de
 * producción.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SIZE = 16;
const PALETTE = { '.': null, H: '#0a0a0f', h: '#1c1f2b', S: '#2a2e3f', B: '#1c1f2b' };
const ACCENT = '#6b7280';
const ACCENT_DIM = '#3d4256';

// Misma silueta que `generate-mascot-sprite.mjs` (frame `idle`, ver ese
// archivo para el detalle de por qué calca imagen/personajeSpider.jpg).
const BASE = [
  '................',
  '.......HHH......',
  '......HhhH......',
  '.....HhhhhH.....',
  '....HhhhhhhH....',
  '.HHHHHHHHHHHHHH.',
  '...SSSSSSSSSS...',
  '...BBAAAAAABB...',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '.BBBBBBBBBBBBBB.',
  '..BBBBBBBB.BBBOO',
  '..BBBBBBB..BB...',
  '...BBBBBBBB.....',
  '...BBB..BBB.....',
  '..BBB.....BBB...',
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const pixels = new Uint8Array(SIZE * SIZE * 4);
BASE.forEach((line, y) => {
  line.split('').forEach((ch, x) => {
    let rgb;
    if (ch === 'A' || ch === 'O') rgb = hexToRgb(ACCENT);
    else if (ch === 'a') rgb = hexToRgb(ACCENT_DIM);
    else {
      const hex = PALETTE[ch];
      if (!hex) return;
      rgb = hexToRgb(hex);
    }
    const idx = (y * SIZE + x) * 4;
    pixels[idx] = rgb[0];
    pixels[idx + 1] = rgb[1];
    pixels[idx + 2] = rgb[2];
    pixels[idx + 3] = 255;
  });
});

function crc32(buf) {
  const table = crc32.table ?? (crc32.table = makeTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    const c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
  function makeTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let cc = n;
      for (let k = 0; k < 8; k += 1) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      t[n] = cc >>> 0;
    }
    return t;
  }
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(SIZE, 0);
ihdrData.writeUInt32BE(SIZE, 4);
ihdrData[8] = 8;
ihdrData[9] = 6;
const ihdr = chunk('IHDR', ihdrData);

const stride = SIZE * 4;
const raw = Buffer.alloc((stride + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (stride + 1)] = 0;
  Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
}
const idat = chunk('IDAT', deflateSync(raw));
const iend = chunk('IEND', Buffer.alloc(0));
const png = Buffer.concat([signature, ihdr, idat, iend]);

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'sprites');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'favicon.png'), png);
console.log('Favicon generado.');
