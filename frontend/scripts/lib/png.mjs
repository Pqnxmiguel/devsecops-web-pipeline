/**
 * Codec PNG mínimo, sin dependencias (ni `canvas`, ni `sharp`, ni `pngjs`):
 * decode (firma + chunks + `zlib.inflateSync` + un-filtrado de scanlines) y
 * encode (chunks + `zlib.deflateSync` + CRC32 propio) para RGBA de 8 bits,
 * sin interlace — el único perfil que necesitan `imagen/spider.png` y los
 * sprites que este proyecto genera.
 *
 * Compartido por `generate-mascot-sprite.mjs` y `generate-favicon.mjs`, que
 * antes duplicaban el encoder. Ver docs/architecture/frontend-design.md
 * "Sprite — decisión de origen del arte" para el porqué de decodificar en vez
 * de redibujar a mano.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    const c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC_TABLE[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Decodifica un PNG RGBA de 8 bits, sin interlace, a un buffer plano de
 * píxeles [{r,g,b,a}, width, height]. Revierte los 5 filtros de scanline
 * estándar de PNG (None/Sub/Up/Average/Paeth, spec §9.2) — es la mitad
 * simétrica de `encodePng`.
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('No es un PNG válido (firma no coincide).');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(
          `Perfil PNG no soportado por este decoder: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace} (se esperaba RGBA de 8 bits sin interlace).`,
        );
      }
    } else if (type === 'IDAT') {
      idatParts.push(data);
    }
    offset += 8 + len + 4;
    if (type === 'IEND') break;
  }

  const inflated = inflateSync(Buffer.concat(idatParts));
  const bytesPerPixel = 4; // RGBA de 8 bits
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);

  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[pos];
    pos += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[pos + x];
      const a = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bytesPerPixel && y > 0 ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let value = raw;
      if (filterType === 1) value = (raw + a) & 0xff;
      else if (filterType === 2) value = (raw + b) & 0xff;
      else if (filterType === 3) value = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (raw + predictor) & 0xff;
      }
      pixels[y * stride + x] = value;
    }
    pos += stride;
  }

  return { width, height, pixels };
}

/** Encodea RGBA de 8 bits sin interlace y sin filtrado (filtro `None` en cada scanline). */
export function encodePng(width, height, rgba) {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([SIGNATURE, ihdr, idat, iend]);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
