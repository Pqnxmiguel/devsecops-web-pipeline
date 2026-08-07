/**
 * Genera `public/sprites/favicon.png`: downsampling nearest-neighbor directo
 * de `imagen/spider.png` (mismo pipeline que `generate-mascot-sprite.mjs`,
 * ver ese archivo para el detalle) a un cuadrado de `SIZE`px en el tono
 * `idle` (gafas `pixel-fog`). Se recorta a cuadrado (en vez de heredar el
 * frame 32×40 del sheet) porque un favicon vive en un contenedor cuadrado del
 * navegador — usar el frame completo lo dejaría con letterboxing feo a esa
 * escala tan pequeña.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng, hexToRgb } from './lib/png.mjs';

const SOURCE_IMAGE = path.resolve(import.meta.dirname, '..', '..', 'imagen', 'spider.png');
const SIZE = 32;
const ACCENT = '#6b7280'; // pixel-fog, mismo tono `idle` que la columna 0 del sheet

const TOKEN = {
  bg: '#0a0a0f',
  ink: '#1c1f2b',
  ink2: '#2a2e3f',
  slate: '#3d4256',
};

const source = decodePng(readFileSync(SOURCE_IMAGE));

function srcPixel(x, y) {
  const i = (y * source.width + x) * 4;
  return { r: source.pixels[i], g: source.pixels[i + 1], b: source.pixels[i + 2], a: source.pixels[i + 3] };
}

const ALPHA_THRESHOLD = 128;
let minX = source.width;
let maxX = 0;
let minY = source.height;
let maxY = 0;
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    if (srcPixel(x, y).a < ALPHA_THRESHOLD) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
// Favicon cuadrado: se recorta al bbox de la CABEZA (sombrero + gafas), no al
// cuerpo entero, para que la silueta reconocible (sombrero/gafas) no quede
// diminuta dentro de un cuadrado que en su mayoría sería abrigo.
const bboxW = maxX - minX + 1;
const headH = Math.round((maxY - minY + 1) * 0.62); // el sombrero+gafas ocupa ~62% superior de la figura
const cropSize = Math.min(bboxW, headH);
const cropX = minX + Math.floor((bboxW - cropSize) / 2);
const cropY = minY;

function classify(x, y) {
  const sx = cropX + Math.min(cropSize - 1, Math.floor(((x + 0.5) * cropSize) / SIZE));
  const sy = cropY + Math.min(cropSize - 1, Math.floor(((y + 0.5) * cropSize) / SIZE));
  const { r, g, b, a } = srcPixel(sx, sy);
  if (a < ALPHA_THRESHOLD) return '.';
  const lum = (r + g + b) / 3;
  if (lum >= 110) return 'A';
  if (lum >= 62) return 'L';
  if (lum >= 35) return 'M';
  if (lum >= 13) return 'I';
  return 'K';
}

const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const ch = classify(x, y);
    if (ch === '.') continue;
    const rgb =
      ch === 'A'
        ? hexToRgb(ACCENT)
        : ch === 'K'
          ? hexToRgb(TOKEN.bg)
          : ch === 'I'
            ? hexToRgb(TOKEN.ink)
            : ch === 'M'
              ? hexToRgb(TOKEN.ink2)
              : hexToRgb(TOKEN.slate);
    const idx = (y * SIZE + x) * 4;
    pixels[idx] = rgb[0];
    pixels[idx + 1] = rgb[1];
    pixels[idx + 2] = rgb[2];
    pixels[idx + 3] = 255;
  }
}

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'sprites');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'favicon.png'), encodePng(SIZE, SIZE, pixels));
console.log(`Favicon generado (${SIZE}x${SIZE}px, recorte de cabeza ${cropSize}x${cropSize} en (${cropX},${cropY})).`);
