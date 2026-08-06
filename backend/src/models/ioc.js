/**
 * Entidad IOC: union discriminada por `type`.
 *
 *   { type: 'ip',     value, ipVersion }
 *   { type: 'hash',   value, algorithm }
 *   { type: 'domain', value }
 *
 * El valor SIEMPRE se guarda normalizado, nunca como lo tecleo el usuario.
 */

import {
  MAX_IOC_LENGTH,
  classifyIp,
  hashAlgorithm,
  isValidDomain,
} from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

/** @type {readonly ('ip'|'hash'|'domain')[]} */
export const IOC_TYPES = Object.freeze(['ip', 'hash', 'domain']);

/**
 * @param {unknown} rawValue
 * @returns {string}
 */
function toNormalisedString(rawValue) {
  if (typeof rawValue !== 'string') {
    throw new ValidationError('El campo "value" debe ser una cadena de texto.', {
      field: 'value',
    });
  }
  // Guarda de tamano ANTES de cualquier parsing: acota el trabajo por request.
  if (rawValue.length > MAX_IOC_LENGTH) {
    throw new ValidationError(
      `El campo "value" excede el maximo de ${MAX_IOC_LENGTH} caracteres.`,
      { field: 'value' },
    );
  }
  const normalised = rawValue.trim().toLowerCase();
  if (normalised.length === 0) {
    throw new ValidationError('El campo "value" no puede estar vacio.', {
      field: 'value',
    });
  }
  return normalised;
}

/** @param {string} value @returns {import('./ioc.js').Ioc} */
function createIpIoc(value) {
  const ipVersion = classifyIp(value);
  if (ipVersion === 0) {
    throw new ValidationError(
      'El valor no es una direccion IP valida (se espera IPv4 o IPv6, sin mascara CIDR).',
      { field: 'value', expected: ['192.0.2.10', '2001:db8::1'] },
    );
  }
  return { type: 'ip', value, ipVersion };
}

/** @param {string} value */
function createHashIoc(value) {
  const algorithm = hashAlgorithm(value);
  if (algorithm === null) {
    throw new ValidationError(
      'El valor no es un hash valido (se espera hexadecimal de 32 (MD5), 40 (SHA-1) o 64 (SHA-256) caracteres).',
      { field: 'value', expected: ['md5', 'sha1', 'sha256'] },
    );
  }
  return { type: 'hash', value, algorithm };
}

/** @param {string} value */
function createDomainIoc(value) {
  // Forma FQDN: se acepta un unico punto final y se normaliza quitandolo.
  const withoutTrailingDot = value.endsWith('.') ? value.slice(0, -1) : value;
  if (!isValidDomain(withoutTrailingDot)) {
    throw new ValidationError(
      'El valor no es un dominio valido (se espera algo como "ejemplo.com", sin esquema, puerto ni ruta).',
      { field: 'value', expected: ['ejemplo.com', 'sub.ejemplo.com'] },
    );
  }
  return { type: 'domain', value: withoutTrailingDot };
}

const FACTORIES = {
  ip: createIpIoc,
  hash: createHashIoc,
  domain: createDomainIoc,
};

/**
 * Construye un IOC validado y normalizado, o lanza `ValidationError`.
 *
 * @param {'ip'|'hash'|'domain'} type
 * @param {unknown} rawValue
 */
export function createIoc(type, rawValue) {
  const factory = FACTORIES[type];
  if (!factory) {
    throw new ValidationError(`Tipo de IOC no soportado: "${String(type)}".`, {
      field: 'type',
      expected: [...IOC_TYPES],
    });
  }
  return factory(toNormalisedString(rawValue));
}
