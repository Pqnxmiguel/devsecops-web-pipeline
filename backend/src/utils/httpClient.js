/**
 * Cliente HTTP para fuentes externas.
 *
 * Dos responsabilidades, y solo dos:
 *  1. TODA llamada saliente lleva un presupuesto de tiempo. Una fuente colgada
 *     no puede colgar el request del usuario.
 *  2. Traduce cualquier fallo de red o de protocolo a un `SourceError`
 *     clasificado, sin arrastrar el cuerpo de la respuesta upstream (que puede
 *     contener detalles internos del proveedor).
 */

import { SourceError } from './errors.js';

export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * @param {string} url
 * @param {object} options
 * @param {string} options.source        Id de la fuente, para clasificar el error.
 * @param {number} [options.timeoutMs]   Presupuesto de tiempo.
 * @param {Record<string,string>} [options.headers]
 * @param {'GET'|'POST'} [options.method]
 * @param {Record<string,string>} [options.form]  Cuerpo form-urlencoded (URLhaus).
 * @returns {Promise<unknown>} El cuerpo JSON ya parseado.
 */
export async function fetchJson(
  url,
  { source, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', form },
) {
  const requestHeaders = { accept: 'application/json', ...headers };
  let body;
  if (form) {
    // URLSearchParams codifica los valores: nada del input del usuario puede
    // romper la estructura del cuerpo.
    body = new URLSearchParams(form).toString();
    requestHeaders['content-type'] = 'application/x-www-form-urlencoded';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new SourceError(
      isTimeout
        ? `La fuente ${source} no respondio dentro de ${timeoutMs} ms.`
        : `No se pudo contactar la fuente ${source}.`,
      { source, kind: isTimeout ? 'timeout' : 'unavailable' },
    );
  }

  if (response.status === 429) {
    throw new SourceError(`La fuente ${source} aplico rate limiting.`, {
      source,
      kind: 'rate_limit',
    });
  }

  if (!response.ok) {
    // El cuerpo upstream se descarta a proposito: puede traer detalles internos
    // del proveedor y no aporta nada accionable al cliente. Solo se conserva el
    // codigo, que algunas fuentes usan semanticamente (VirusTotal 404 = hash
    // desconocido, no fallo).
    const error = new SourceError(
      `La fuente ${source} respondio con estado ${response.status}.`,
      { source, kind: 'unavailable' },
    );
    error.httpStatus = response.status;
    throw error;
  }

  try {
    return await response.json();
  } catch {
    throw new SourceError(`La fuente ${source} devolvio un cuerpo no interpretable.`, {
      source,
      kind: 'bad_response',
    });
  }
}
