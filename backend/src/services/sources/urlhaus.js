/**
 * Fuente: URLhaus / abuse.ch (dominios en listas de distribucion de malware).
 *
 * Forma cruda: estado de listado, no un numero. La escala comun se construye por
 * estado. Umbrales: docs/architecture/domain-model.md seccion 3.4.
 */

import { fetchJson as defaultFetchJson } from '../../utils/httpClient.js';
import { createSourceReport } from '../../models/verdict.js';
import { SourceError } from '../../utils/errors.js';
import { urlhausMockResponse } from './mocks/urlhaus.mock.js';

export const SOURCE_ID = 'urlhaus';
const ENDPOINT = 'https://urlhaus-api.abuse.ch/v1/host/';

const SCORE_LISTED_OFFLINE = 55;
const SCORE_LISTED_ONLINE = 90;
const SCORE_BLACKLISTED = 100;

/** @param {unknown} blacklists @returns {boolean} */
function isBlacklisted(blacklists) {
  if (!blacklists || typeof blacklists !== 'object') return false;
  return Object.values(blacklists).some(
    (status) => typeof status === 'string' && status !== 'not listed',
  );
}

/**
 * Union deduplicada de `entry.tags` a traves de todas las urls. Una URL sin
 * `tags` (o con un valor que no es array) simplemente no aporta nada -- nunca
 * lanza.
 * @param {unknown[]} urls
 * @returns {string[]}
 */
function extractTags(urls) {
  const tags = new Set();
  for (const entry of urls) {
    if (!Array.isArray(entry?.tags)) continue;
    for (const tag of entry.tags) tags.add(tag);
  }
  return [...tags];
}

/**
 * `entry.threat` de la primera url que lo tenga, o `null` si ninguna.
 * @param {unknown[]} urls
 * @returns {string | null}
 */
function firstThreatType(urls) {
  for (const entry of urls) {
    if (typeof entry?.threat === 'string') return entry.threat;
  }
  return null;
}

/**
 * Traduce la respuesta cruda de URLhaus a un SourceReport.
 * @param {unknown} raw
 */
export function normalizeUrlhaus(raw) {
  const status = raw?.query_status;

  if (status === 'no_results') {
    return createSourceReport({
      source: SOURCE_ID,
      level: 'clean',
      score: 0,
      // La ausencia de listado es una senal debil: URLhaus solo cubre
      // distribucion de malware, no phishing ni C2.
      confidence: 0.5,
      details: { listed: false, totalUrls: 0, onlineUrls: 0, tags: [], threatType: null },
    });
  }

  if (status !== 'ok') {
    throw new SourceError(
      `URLhaus devolvio un estado de consulta no interpretable: "${String(status)}".`,
      { source: SOURCE_ID, kind: 'bad_response' },
    );
  }

  const urls = Array.isArray(raw.urls) ? raw.urls : [];
  const onlineUrls = urls.filter((entry) => entry?.url_status === 'online').length;
  const blacklisted = isBlacklisted(raw.blacklists);

  // Un host cuyas URLs estan todas caidas sigue siendo infraestructura
  // comprometida (suele reactivarse), pero no es una amenaza activa.
  const level = onlineUrls > 0 || blacklisted ? 'malicious' : 'suspicious';
  let score;
  if (blacklisted) score = SCORE_BLACKLISTED;
  else if (onlineUrls > 0) score = SCORE_LISTED_ONLINE;
  else score = SCORE_LISTED_OFFLINE;

  return createSourceReport({
    source: SOURCE_ID,
    level,
    score,
    confidence: level === 'malicious' ? 0.95 : 0.7,
    details: {
      listed: true,
      totalUrls: urls.length,
      onlineUrls,
      blacklisted,
      firstSeen: raw.firstseen ?? null,
      tags: extractTags(urls),
      threatType: firstThreatType(urls),
    },
  });
}

/**
 * @param {object} options
 * @param {boolean} options.useMock
 * @param {number} [options.timeoutMs]
 * @param {string} [options.authKey]  Opcional: abuse.ch pide `Auth-Key` en su API actual.
 * @param {typeof defaultFetchJson} [options.fetchJson]  Inyectable para tests.
 */
export function createUrlhausSource({
  useMock,
  timeoutMs,
  authKey,
  fetchJson = defaultFetchJson,
}) {
  return {
    id: SOURCE_ID,
    supports: (iocType) => iocType === 'domain',
    async lookup(ioc) {
      if (useMock) {
        return normalizeUrlhaus(urlhausMockResponse(ioc));
      }
      const raw = await fetchJson(ENDPOINT, {
        source: SOURCE_ID,
        timeoutMs,
        method: 'POST',
        form: { host: ioc.value },
        headers: authKey ? { 'Auth-Key': authKey } : {},
      });
      return normalizeUrlhaus(raw);
    },
  };
}
