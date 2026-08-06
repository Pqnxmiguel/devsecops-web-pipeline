/**
 * Validadores puros de IOCs.
 *
 * Todos son de complejidad LINEAL sobre la longitud del input y trabajan sobre
 * datos controlados por el atacante, asi que ninguna regla se expresa con una
 * regex de cuantificadores anidados (vector clasico de ReDoS). Ver ADR 1 en
 * docs/architecture/domain-model.md:
 *   - IP     -> `net.isIP`, el parser nativo de Node.
 *   - Hash   -> comprobacion de longitud + clase de caracteres plana.
 *   - Dominio-> split por etiquetas + recorrido lineal, sin regex.
 */

import net from 'node:net';

/** Longitud maxima aceptada para cualquier valor de IOC antes de parsear. */
export const MAX_IOC_LENGTH = 300;

/** Longitud de hash hexadecimal -> algoritmo. */
const HASH_ALGORITHM_BY_LENGTH = new Map([
  [32, 'md5'],
  [40, 'sha1'],
  [64, 'sha256'],
]);

const MAX_DOMAIN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

/**
 * @param {unknown} value
 * @returns {0|4|6} Version de IP, o 0 si no es una direccion valida.
 */
export function classifyIp(value) {
  if (typeof value !== 'string') return 0;
  return net.isIP(value);
}

/** @param {unknown} value @returns {boolean} */
export function isValidIp(value) {
  return classifyIp(value) !== 0;
}

/** @param {number} code @returns {boolean} */
function isHexCharCode(code) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 97 && code <= 102) // a-f (el input ya viene en minusculas)
  );
}

/**
 * @param {unknown} value  Hash en minusculas.
 * @returns {'md5'|'sha1'|'sha256'|null}
 */
export function hashAlgorithm(value) {
  if (typeof value !== 'string') return null;
  const algorithm = HASH_ALGORITHM_BY_LENGTH.get(value.length);
  if (!algorithm) return null;
  for (let i = 0; i < value.length; i += 1) {
    if (!isHexCharCode(value.charCodeAt(i))) return null;
  }
  return algorithm;
}

/** @param {unknown} value @returns {boolean} */
export function isValidHash(value) {
  return hashAlgorithm(value) !== null;
}

/** @param {number} code @returns {boolean} */
function isDomainCharCode(code) {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 45 // '-'
  );
}

/**
 * @param {string} label
 * @returns {boolean}
 */
function isValidLabel(label) {
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) return false;
  if (label.startsWith('-') || label.endsWith('-')) return false;
  for (let i = 0; i < label.length; i += 1) {
    if (!isDomainCharCode(label.charCodeAt(i))) return false;
  }
  return true;
}

/**
 * Valida un nombre de dominio ya normalizado (minusculas, sin punto final).
 * Rechaza esquemas, paths, puertos y metacaracteres por la via de la clase de
 * caracteres permitida: cualquier `/`, `:`, espacio o `;` cae fuera.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidDomain(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_DOMAIN_LENGTH) return false;

  const labels = value.split('.');
  if (labels.length < 2) return false;

  for (const label of labels) {
    if (!isValidLabel(label)) return false;
  }

  // El TLD debe ser alfabetico: evita que un IPv4 ('1.2.3.4') pase por dominio.
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  for (let i = 0; i < tld.length; i += 1) {
    const code = tld.charCodeAt(i);
    if (code < 97 || code > 122) return false;
  }

  return true;
}
