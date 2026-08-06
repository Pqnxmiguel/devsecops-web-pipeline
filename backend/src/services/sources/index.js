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
 * @returns {{id: string, supports: Function, lookup: Function}[]}
 */
export function createSources(config) {
  const shared = {
    useMock: config.useMockSources,
    timeoutMs: config.sourceTimeoutMs,
  };

  return [
    createAbuseipdbSource({ ...shared, apiKey: config.abuseipdbApiKey }),
    createVirustotalSource({ ...shared, apiKey: config.virustotalApiKey }),
    createUrlhausSource({ ...shared, authKey: config.urlhausAuthKey }),
  ];
}
