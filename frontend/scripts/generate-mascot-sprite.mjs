/**
 * Genera `public/sprites/mascot.png` por DOWNSAMPLING ALGORÍTMICO de la
 * referencia real `imagen/spider.png` (509×704, chibi pixel art ya blocky:
 * sombrero fedora, gafas ovaladas en V, abrigo con brazos cruzados), en vez
 * de redibujar la silueta a mano en una grilla ASCII (enfoque de la versión
 * anterior, con `imagen/personajeSpider.jpg`). Ver
 * docs/architecture/frontend-design.md "Sprite — decisión de origen del arte"
 * para el porqué de este cambio de enfoque.
 *
 * Pipeline, 100% sin dependencias (solo `node:zlib` vía `scripts/lib/png.mjs`):
 *   1. Decodificar `imagen/spider.png` (RGBA de 8 bits) con un parser de
 *      chunks PNG + `zlib.inflateSync` propio (simétrico al encoder que ya
 *      existía).
 *   2. Recortar al bounding box de píxeles no transparentes (la fuente trae
 *      márgenes transparentes).
 *   3. Reducir con NEAREST NEIGHBOR (sin promediar ni interpolar — es lo que
 *      mantiene los bordes duros del pixel art) a un frame de
 *      `FRAME_W`×`FRAME_H`.
 *   4. Cuantizar cada píxel muestreado a la paleta de tokens del proyecto por
 *      banda de luminancia (la fuente es esencialmente escala de grises: los
 *      207 tonos distintos que trae por antialiasing colapsan de forma
 *      natural en las 4 bandas oscuras + 1 banda clara de acento, que es
 *      justo la estructura tonal de la referencia: contorno casi negro,
 *      cuerpo del sombrero/abrigo, sombra del ala, gafas claras).
 *   5. La banda clara ("acento") es la de las gafas — es la única región que
 *      cambia de color por estado (`STATES`), igual que en la versión
 *      anterior; el resto de la silueta es fiel a la foto real en todos los
 *      estados.
 *   6. Generar 2 frames de animación por estado (parpadeo / glitch) variando
 *      solo esa región de acento, y componer el sheet 4 columnas × 2 filas.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng, hexToRgb } from './lib/png.mjs';

const SOURCE_IMAGE = path.resolve(import.meta.dirname, '..', '..', 'imagen', 'spider.png');
const FRAME_W = 32; // px por frame en el sheet generado — el doble de resolución que el placeholder anterior (16px)
const FRAME_H = 40; // el personaje es más alto que ancho (bbox real ≈ 486×671, ratio 0.72); 32/40 = 0.8 se acerca sin achatarlo
const COLS = 4; // idle | calm | alert | confused
const ROWS = 2; // 2 frames de animación por estado

// Paleta — deben ser EXACTAMENTE los tokens de tailwind.config.js `colors.pixel`.
// Cero colores nuevos: la cuantización reutiliza los 4 tonos oscuros ya
// existentes en la paleta de 13, ver frontend-design.md.
const TOKEN = {
  bg: '#0a0a0f', // outline / sombra más profunda
  ink: '#1c1f2b', // cuerpo del sombrero / abrigo
  ink2: '#2a2e3f', // banda media (ala del sombrero, pliegues)
  slate: '#3d4256', // banda clara estructural (bordes iluminados del abrigo/sombrero)
};

// Estados: qué color toma la región de acento (gafas) en cada uno. El resto
// de la silueta (sombrero, abrigo, contorno) es la misma foto real en los 4.
const STATES = [
  { name: 'idle', accent: '#6b7280', accentDim: '#3d4256' }, // pixel-fog / pixel-slate
  { name: 'calm', accent: '#3ddc84', accentDim: '#1f7a4a' }, // pixel-clean
  { name: 'alert', accent: '#f5c542', accentDim: '#8a6b1f' }, // pixel-suspicious (malicious se aplica como halo en CSS, no en el sprite)
  { name: 'confused', accent: '#9b8cff', accentDim: '#4d4480' }, // pixel-unknown
];

// --- 1. Decodificar la referencia real ---
const source = decodePng(readFileSync(SOURCE_IMAGE));

function srcPixel(x, y) {
  const i = (y * source.width + x) * 4;
  return { r: source.pixels[i], g: source.pixels[i + 1], b: source.pixels[i + 2], a: source.pixels[i + 3] };
}

// --- 2. Bounding box de contenido no transparente ---
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
const bboxW = maxX - minX + 1;
const bboxH = maxY - minY + 1;
console.log(`Referencia: ${source.width}x${source.height}px. Bbox de contenido: ${bboxW}x${bboxH}px en (${minX},${minY}).`);

// --- 3-4. Downsample nearest-neighbor + cuantización por banda de luminancia ---
// Códigos de celda: '.' transparente, K/I/M/L = tonos estructurales oscuros
// (bg/ink/ink2/slate), 'A' = región de acento (gafas), recoloreada por estado.
function classify(x, y) {
  const sx = minX + Math.min(bboxW - 1, Math.floor(((x + 0.5) * bboxW) / FRAME_W));
  const sy = minY + Math.min(bboxH - 1, Math.floor(((y + 0.5) * bboxH) / FRAME_H));
  const { r, g, b, a } = srcPixel(sx, sy);
  if (a < ALPHA_THRESHOLD) return '.';
  const lum = (r + g + b) / 3;
  if (lum >= 110) return 'A'; // gafas: banda clara, único acento de color
  if (lum >= 62) return 'L'; // pixel-slate
  if (lum >= 35) return 'M'; // pixel-ink2
  if (lum >= 13) return 'I'; // pixel-ink
  return 'K'; // pixel-bg (contorno)
}

const BASE = [];
for (let y = 0; y < FRAME_H; y += 1) {
  let row = '';
  for (let x = 0; x < FRAME_W; x += 1) row += classify(x, y);
  BASE.push(row);
}

const accentPixelCount = BASE.join('').split('').filter((c) => c === 'A').length;
if (accentPixelCount < 4) {
  throw new Error(
    `Solo se detectaron ${accentPixelCount} píxeles de acento (gafas) tras la cuantización — el umbral de luminancia probablemente no calza con esta imagen. Revisar ALPHA_THRESHOLD/bandas.`,
  );
}
console.log(`Frame base: ${FRAME_W}x${FRAME_H}px, ${accentPixelCount} píxeles de acento (gafas) detectados.`);

/** Variante "blink": la región de acento pasa entera a su tono `accentDim` (gafas "cerradas"/apagadas). */
function blinkVariant(rows) {
  return rows.map((row) => row.replaceAll('A', 'a'));
}

/** Variante "glitch" (solo `confused`): patrón de acento irregular en vez de un simple apagado. */
function glitchVariant(rows) {
  return rows.map((row, y) =>
    row
      .split('')
      .map((c, x) => {
        if (c !== 'A') return c;
        return (x + y) % 2 === 0 ? 'A' : 'a';
      })
      .join(''),
  );
}

function framesFor(state) {
  const frameA = BASE;
  const frameB = state.name === 'confused' ? glitchVariant(BASE) : blinkVariant(BASE);
  return [frameA, frameB];
}

// --- 5-6. Componer el sheet ---
const sheetW = FRAME_W * COLS;
const sheetH = FRAME_H * ROWS;
const pixels = new Uint8Array(sheetW * sheetH * 4);

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
    const originX = col * FRAME_W;
    const originY = row * FRAME_H;
    frame.forEach((line, y) => {
      line.split('').forEach((ch, x) => {
        if (ch === '.') return; // transparente: no se pinta
        let rgb;
        if (ch === 'A') rgb = hexToRgb(state.accent);
        else if (ch === 'a') rgb = hexToRgb(state.accentDim);
        else if (ch === 'K') rgb = hexToRgb(TOKEN.bg);
        else if (ch === 'I') rgb = hexToRgb(TOKEN.ink);
        else if (ch === 'M') rgb = hexToRgb(TOKEN.ink2);
        else rgb = hexToRgb(TOKEN.slate); // 'L'
        setPixel(originX + x, originY + y, rgb);
      });
    });
  });
});

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'sprites');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'mascot.png');
writeFileSync(outPath, encodePng(sheetW, sheetH, pixels));

console.log(`Sprite generado: ${outPath} (${sheetW}x${sheetH}px, grid ${COLS}x${ROWS} de ${FRAME_W}x${FRAME_H}px)`);
