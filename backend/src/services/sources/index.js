/**
 * Registro de fuentes.
 *
 * Punto unico donde la configuracion se convierte en clientes concretos. Agregar
 * una cuarta fuente es agregar una linea aqui: nada mas del sistema cambia.
 */

import { createAbuseipdbSource } from './abuseipdb.js';
import { createVirustotalSource } from './virustotal.js';
import { createUrlhausSource } from './urlhaus.js';

/**
 * @param {import('../../config/index.js').config} config
 * @param {object} [deps]
 * @param {ReturnType<typeof import('../quota/quotaTracker.js').createQuotaTracker>} [deps.quotaTracker]
 *   Cada fuente solo lo usa en su rama real (`useMock === false`); en modo
 *   mock queda sin efecto.
 * @returns {{id: string, supports: Function, lookup: Function}[]}
 */
export function createSources(config, { quotaTracker } = {}) {
  const shared = {
    useMock: config.useMockSources,
    timeoutMs: config.sourceTimeoutMs,
    quotaTracker,
  };

  return [
    createAbuseipdbSource({ ...shared, apiKey: config.abuseipdbApiKey }),
    createVirustotalSource({ ...shared, apiKey: config.virustotalApiKey }),
    createUrlhausSource({ ...shared, authKey: config.urlhausAuthKey }),
  ];
}
