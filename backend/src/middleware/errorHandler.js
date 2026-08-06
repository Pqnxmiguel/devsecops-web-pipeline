/**
 * Manejo de errores centralizado.
 *
 * Es el UNICO lugar del backend que convierte un error en una respuesta HTTP.
 * Por eso ningun controller tiene try/catch: Express 5 propaga automaticamente
 * el rechazo de un handler async hasta aqui.
 *
 * Contrato de salida, identico para todos los fallos:
 *   { "error": { "code": "...", "message": "...", "field"?: "..." } }
 */

import { AppError } from '../utils/errors.js';

/** Ruta no encontrada: se expresa como error para pasar por el mismo formato. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No existe el recurso ${req.method} ${req.path}.`,
    },
  });
}

/**
 * @param {Error} error
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
// eslint-disable-next-line no-unused-vars -- Express identifica el handler de errores por aridad 4.
export function errorHandler(error, _req, res, _next) {
  // 1. Errores del dominio: seguros de mostrar tal cual.
  if (error instanceof AppError) {
    const body = { code: error.code, message: error.message };
    if (error.field) body.field = error.field;
    if (error.expected) body.expected = error.expected;
    return res.status(error.status).json({ error: body });
  }

  // 2. Errores que produce el propio Express al parsear el request.
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo del request es demasiado grande.' },
    });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'El cuerpo del request no es JSON valido.' },
    });
  }

  // 3. Cualquier otra cosa es un bug nuestro: se registra completo en el
  //    servidor y al cliente le llega un mensaje generico. Ni mensaje interno,
  //    ni stack, ni nombre de la excepcion.
  console.error('[error] fallo no controlado:', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
  });
}
