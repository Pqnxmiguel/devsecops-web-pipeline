/**
 * Validacion de la FORMA del request (no del contenido del IOC).
 *
 * Division de responsabilidades deliberada:
 *   - aqui   -> que el cuerpo/query tengan la estructura esperada;
 *   - modelo -> que el valor satisfaga las invariantes del IOC (`createIoc`).
 *
 * Asi la regla de "que es una IP valida" vive en un unico sitio y no se duplica
 * entre la capa HTTP y el dominio.
 */

import { ValidationError } from '../utils/errors.js';

const ALLOWED_SCAN_FIELDS = new Set(['value']);

/** Cuerpo de un scan: exactamente `{ value: string }`. */
export function validateScanBody(req, _res, next) {
  const body = req.body;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('El cuerpo del request debe ser un objeto JSON.', {
      field: 'body',
    });
  }

  const unexpected = Object.keys(body).filter((key) => !ALLOWED_SCAN_FIELDS.has(key));
  if (unexpected.length > 0) {
    // Rechazar campos desconocidos en vez de ignorarlos: un cliente que manda
    // basura merece enterarse, y cierra la puerta a mass-assignment futuro.
    throw new ValidationError(
      `Campos no admitidos en el cuerpo: ${unexpected.join(', ')}.`,
      { field: 'body', expected: [...ALLOWED_SCAN_FIELDS] },
    );
  }

  if (typeof body.value !== 'string') {
    throw new ValidationError('El campo "value" es obligatorio y debe ser una cadena.', {
      field: 'value',
    });
  }

  next();
}

/**
 * @param {string} name
 * @param {unknown} raw
 * @param {number} fallback
 * @param {{min: number, max: number}} range
 */
function parseBoundedInteger(name, raw, fallback, { min, max }) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ValidationError(`El parametro "${name}" debe ser un entero.`, { field: name });
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ValidationError(`El parametro "${name}" debe ser un entero.`, { field: name });
  }
  if (value < min || value > max) {
    throw new ValidationError(
      `El parametro "${name}" debe estar entre ${min} y ${max}.`,
      { field: name },
    );
  }
  return value;
}

/**
 * Paginacion del historial. El tope de `limit` sale de configuracion: un cliente
 * no puede pedir "todo" y forzar una respuesta arbitrariamente grande.
 *
 * @param {{historyMaxPageSize: number}} config
 */
export function validatePagination(config) {
  return function validatePaginationMiddleware(req, _res, next) {
    req.pagination = {
      limit: parseBoundedInteger('limit', req.query.limit, 20, {
        min: 1,
        max: config.historyMaxPageSize,
      }),
      offset: parseBoundedInteger('offset', req.query.offset, 0, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      }),
    };
    next();
  };
}
