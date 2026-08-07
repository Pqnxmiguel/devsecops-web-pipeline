/**
 * Genera `public/sprites/backdrop-spider.png`: una máscara alfa pixel-art del
 * fondo ambiental (ver `components/fx/ThreatBackdrop.tsx`), por el MISMO
 * criterio que `generate-mascot-sprite.mjs` usa para la mascota — downsampling
 * algorítmico de una referencia real (`imagen/araña.png`, 980×980) en vez de
 * un vector de líneas dibujado a mano. Ver
 * docs/architecture/frontend-design.md §11 "Fondo ambiental — pixel-art
 * fotográfico, no vector de líneas" para el porqué de este cambio.
 *
 * A diferencia del sprite de la mascota (que cuantiza a varias bandas de
 * color porque tiene estados distintos y una región de acento recoloreable),
 * acá sólo hace falta UNA máscara alfa: el color final lo pone en runtime
 * `ThreatBackdrop` vía `mask-image` + `background-color: currentColor`, así
 * el mismo PNG se tiñe con el color de amenaza activo
 * (`threatTintClassFor`, `components/mascot/mascotState.ts`) sin tener que
 * generar una variante por estado como en el sprite de la mascota.
 *
 * Pipeline, 100% sin dependencias (`scripts/lib/png.mjs`, ya usado por el
 * sprite de la mascota y el favicon):
 *   1. Decodificar `imagen/araña.png` (RGBA de 8 bits; el fondo ya viene
 *      transparente — alpha 0 fuera de la silueta, ~255 dentro — así que la
 *      "clasificación" es un simple umbral de alfa, no de luminancia).
 *   2. Recortar al bounding box de contenido no transparente (por si la
 *      referencia trae márgenes).
 *   3. Reducir con NEAREST NEIGHBOR a `FRAME_SIZE`×`FRAME_SIZE` — la
 *      referencia YA es pixel art bloqueado (grilla nativa ≈19×19, bloques de
 *      ~51px), así que este paso simplemente re-cuantiza a una grilla de
 *      salida más manejable sin introducir antialiasing (ver `classify`).
 *   4. Emitir blanco 100% opaco donde hay silueta y transparente donde no —
 *      es una máscara alfa pura, no importa el color original (los ojos
 *      rojos de la referencia no se preservan como acento: la silueta entera
 *      se tiñe de un solo color de amenaza, igual que el resto del fondo).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './lib/png.mjs';

const SOURCE_IMAGE = path.resolve(import.meta.dirname, '..', '..', 'imagen', 'araña.png');
const FRAME_SIZE = 40; // cuadrado: la referencia es 980x980. ~2x la grilla nativa (~19x19) para que el mask-size escale sin perder los bloques.
const ALPHA_THRESHOLD = 128;

const source = decodePng(readFileSync(SOURCE_IMAGE));

function srcPixel(x, y) {
  const i = (y * source.width + x) * 4;
  return { a: source.pixels[i + 3] };
}

// --- Bounding box de contenido no transparente ---
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

// --- Downsample nearest-neighbor + umbral de alfa ---
function isOn(x, y) {
  const sx = minX + Math.min(bboxW - 1, Math.floor(((x + 0.5) * bboxW) / FRAME_SIZE));
  const sy = minY + Math.min(bboxH - 1, Math.floor(((y + 0.5) * bboxH) / FRAME_SIZE));
  return srcPixel(sx, sy).a >= ALPHA_THRESHOLD;
}

const pixels = new Uint8Array(FRAME_SIZE * FRAME_SIZE * 4);
let onCount = 0;
for (let y = 0; y < FRAME_SIZE; y += 1) {
  for (let x = 0; x < FRAME_SIZE; x += 1) {
    const idx = (y * FRAME_SIZE + x) * 4;
    if (isOn(x, y)) {
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = 255;
      onCount += 1;
    }
    // si no está "on", queda en 0/0/0/0 (transparente) por el Uint8Array ya inicializado en cero.
  }
}

if (onCount < 16) {
  throw new Error(
    `Sólo se detectaron ${onCount} píxeles de silueta tras la cuantización — revisar ALPHA_THRESHOLD o el bbox contra esta imagen.`,
  );
}
console.log(`Máscara generada: ${FRAME_SIZE}x${FRAME_SIZE}px, ${onCount} píxeles de silueta.`);

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'sprites');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'backdrop-spider.png');
writeFileSync(outPath, encodePng(FRAME_SIZE, FRAME_SIZE, pixels));

console.log(`Máscara escrita: ${outPath}`);
