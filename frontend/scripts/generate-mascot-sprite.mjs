/**
 * Genera `public/sprites/mascot.png` a mano, pixel a pixel, sin ninguna
 * dependencia de imagen (ni `canvas`, ni `sharp`): un encoder PNG mínimo
 * (firma + IHDR + IDAT deflate + IEND, con CRC32 propio) sobre un grid de
 * caracteres por frame. Es la forma más simple de mantener "cero
 * dependencias" también en la GENERACIÓN del sprite, no solo en su animación.
 *
 * Ver docs/architecture/frontend-design.md §4-5 para el diseño de cada
 * estado. Este arte es un placeholder deliberado (silueta + sombrero + gafas,
 * inspirado en imagen/personajeSpider.jpg), reemplazable 1:1 más adelante:
 * el componente Mascot sólo conoce el grid de frames, no el arte en sí.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const FRAME = 16; // px por frame, en el grid de caracteres
const COLS = 4; // idle | calm | alert | confused
const ROWS = 2; // 2 frames de animación por estado

// Paleta — debe coincidir con tailwind.config.js `colors.pixel`.
const PALETTE = {
  '.': null, // transparente
  H: '#0a0a0f', // pixel-bg   (borde de sombrero, casi negro)
  h: '#1c1f2b', // pixel-ink  (cuerpo del sombrero)
  S: '#2a2e3f', // pixel-ink2 (sombra bajo el ala del sombrero)
  B: '#1c1f2b', // pixel-ink  (silueta: cabeza/hombros)
};

// Silueta base compartida por los 4 estados (16x16), calcada de la pose de
// `imagen/personajeSpider.jpg`: sombrero de ala ancha y copa cónica, gafas
// rectangulares blancas de una sola franja horizontal, hombros anchos y un
// brazo extendido a la derecha sosteniendo un objeto claro (el "arma" de la
// referencia). `A`/`a` = gafas con el color de acento del estado
// (brillante/tenue). `O` = objeto en la mano extendida.
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

/** Variante "blink": las gafas invierten brillante/tenue. */
function blinkVariant(rows) {
  return rows.map((row) => row.split('').map((c) => (c === 'A' ? 'a' : c === 'a' ? 'A' : c)).join(''));
}

/** Variante "glitch" (solo `confused`): patrón de gafas irregular, no un simple blink. */
function glitchVariant(rows) {
  return rows.map((row, y) =>
    row
      .split('')
      .map((c, x) => {
        if (c !== 'A' && c !== 'a') return c;
        return (x + y) % 2 === 0 ? 'A' : 'a';
      })
      .join(''),
  );
}

/** Quita la "chispa" del objeto en la mano (segunda mitad del parpadeo/animación). */
function withoutSpark(rows) {
  return rows.map((row) => row.replaceAll('O', '.'));
}

const STATES = [
  { name: 'idle', accent: '#6b7280', accentDim: '#3d4256' }, // pixel-fog / pixel-slate
  { name: 'calm', accent: '#3ddc84', accentDim: '#1f7a4a' }, // pixel-clean
  { name: 'alert', accent: '#f5c542', accentDim: '#8a6b1f' }, // pixel-suspicious (el rojo de "malicious" se aplica como halo en CSS, no en el sprite)
  { name: 'confused', accent: '#9b8cff', accentDim: '#4d4480' }, // pixel-unknown
];

function framesFor(state) {
  const frameA = BASE;
  const frameB =
    state.name === 'confused' ? glitchVariant(withoutSpark(BASE)) : withoutSpark(blinkVariant(BASE));
  return [frameA, frameB];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- Compositor: dibuja cada frame en un buffer RGBA del sprite sheet completo ---
const sheetW = FRAME * COLS;
const sheetH = FRAME * ROWS;
const pixels = new Uint8Array(sheetW * sheetH * 4); // RGBA, todo transparente por defecto

function setPixel(px, py, rgb) {
  const idx = (py * sheetW + px) * 4;
  pixels[idx] = rgb[0];
  pixels[idx + 1] = rgb[1];
  pixels[idx + 2] = rgb[2];
  pixels[idx + 3] = 255;
}

STATES.forEach((state, col) => {
  const [frameA, frameB] = framesFor(state);
  [frameA, frameB].forEach((frame, row) => {
    const originX = col * FRAME;
    const originY = row * FRAME;
    frame.forEach((line, y) => {
      line.split('').forEach((ch, x) => {
        let rgb;
        if (ch === 'A') rgb = hexToRgb(state.accent);
        else if (ch === 'a') rgb = hexToRgb(state.accentDim);
        else if (ch === 'O') rgb = hexToRgb(state.accent);
        else {
          const hex = PALETTE[ch];
          if (!hex) return; // transparente: no se pinta
          rgb = hexToRgb(hex);
        }
        setPixel(originX + x, originY + y, rgb);
      });
    });
  });
});

// --- Encoder PNG mínimo ---
function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = makeTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;

  function makeTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let cc = n;
      for (let k = 0; k < 8; k += 1) {
        cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      }
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

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // Cada scanline lleva un byte de filtro (0 = None) antes de sus píxeles.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = chunk('IDAT', deflateSync(raw));

  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'sprites');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'mascot.png');
writeFileSync(outPath, encodePng(sheetW, sheetH, pixels));

console.log(`Sprite generado: ${outPath} (${sheetW}x${sheetH}px, grid ${COLS}x${ROWS} de ${FRAME}px)`);
