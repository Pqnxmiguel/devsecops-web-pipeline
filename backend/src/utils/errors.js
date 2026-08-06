/**
 * Jerarquia de errores del dominio.
 *
 * Regla: solo los errores que heredan de `AppError` son seguros de mostrar al
 * cliente. Cualquier otro error se traduce a un 500 generico en el middleware de
 * errores, sin filtrar stack ni mensajes internos.
 */

export class AppError extends Error {
  /**
   * @param {string} message  Mensaje apto para el cliente.
   * @param {object} options
   * @param {number} options.status  Codigo HTTP.
   * @param {string} options.code    Codigo estable, legible por maquina.
   * @param {object} [options.meta]  Datos extra ya saneados.
   */
  constructor(message, { status, code, meta } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status ?? 500;
    this.code = code ?? 'INTERNAL_ERROR';
    this.expose = true;
    if (meta) this.meta = meta;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** El input del cliente no satisface las invariantes del dominio. */
export class ValidationError extends AppError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.field]  Campo del request que fallo.
   * @param {string[]} [options.expected]  Formas aceptadas, para un mensaje util.
   */
  constructor(message, { field, expected } = {}) {
    super(message, { status: 400, code: 'VALIDATION_ERROR' });
    if (field) this.field = field;
    if (expected) this.expected = expected;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

/**
 * Fallo de una fuente externa. Nunca se serializa tal cual al cliente: el
 * servicio de scan lo convierte en un SourceReport degradado (ver ADR 3 del
 * modelo de dominio).
 */
export class SourceError extends AppError {
  /**
   * @param {string} message
   * @param {object} options
   * @param {string} options.source  Id de la fuente.
   * @param {'timeout'|'rate_limit'|'unavailable'|'bad_response'} options.kind
   */
  constructor(message, { source, kind }) {
    super(message, { status: 502, code: 'SOURCE_ERROR' });
    this.source = source;
    this.kind = kind;
  }
}

/**
 * Configuracion invalida. Se lanza durante el arranque, nunca a mitad de un
 * request: si falta una API key el proceso no debe llegar a escuchar.
 */
export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
  }
}
