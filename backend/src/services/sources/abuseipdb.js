/**
 * Fuente: AbuseIPDB (reputacion de IPs).
 *
 * Forma cruda: `data.abuseConfidenceScore` en 0..100 -- ya es una escala de
 * confianza de abuso, asi que la normalizacion es casi directa.
 * Umbrales: docs/architecture/domain-model.md seccion 3.2.
 */

import { fetchJson as defaultFetchJson } from '../../utils/httpClient.js';
import { createSourceReport } from '../../models/verdict.js';
import { SourceError } from '../../utils/errors.js';
import { abuseipdbMockResponse } from './mocks/abuseipdb.mock.js';

export const SOURCE_ID = 'abuseipdb';
const ENDPOINT = 'https://api.abuseipdb.com/api/v2/check';
const MAX_AGE_IN_DAYS = 90;

/**
 * Traduce la respuesta cruda de AbuseIPDB a un SourceReport.
 * @param {unknown} raw
 */
export function normalizeAbuseipdb(raw) {
  const data = raw?.data;
  const score = data?.abuseConfidenceScore;
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new SourceError('AbuseIPDB devolvio una respuesta sin score de abuso.', {
      source: SOURCE_ID,
      kind: 'bad_response',
    });
  }

  const totalReports = typeof data.totalReports === 'number' ? data.totalReports : 0;

  let level;
  let confidence;
  if (score >= 75) {
    level = 'malicious';
    confidence = 0.9;
  } else if (score >= 25) {
    level = 'suspicious';
    confidence = 0.7;
  } else {
    level = 'clean';
    // Score 0 sin reportes solo significa "nadie la ha reportado": senal debil.
    confidence = totalReports === 0 ? 0.3 : 0.7;
  }

  return createSourceReport({
    source: SOURCE_ID,
    level,
    score,
    confidence,
    details: {
      abuseConfidenceScore: score,
      totalReports,
      countryCode: data.countryCode ?? null,
      isp: data.isp ?? null,
      lastReportedAt: data.lastReportedAt ?? null,
    },
  });
}

/**
 * @param {object} options
 * @param {boolean} options.useMock
 * @param {string} [options.apiKey]
 * @param {number} [options.timeoutMs]
 * @param {typeof defaultFetchJson} [options.fetchJson]  Inyectable para tests.
 */
export function createAbuseipdbSource({
  useMock,
  apiKey,
  timeoutMs,
  fetchJson = defaultFetchJson,
}) {
  return {
    id: SOURCE_ID,
    supports: (iocType) => iocType === 'ip',
    async lookup(ioc) {
      if (useMock) {
        return normalizeAbuseipdb(abuseipdbMockResponse(ioc));
      }
      const query = new URLSearchParams({
        ipAddress: ioc.value,
        maxAgeInDays: String(MAX_AGE_IN_DAYS),
      });
      const raw = await fetchJson(`${ENDPOINT}?${query}`, {
        source: SOURCE_ID,
        timeoutMs,
        // La API key viaja en cabecera, nunca en la query string: las URLs
        // acaban en logs de proxy y de acceso.
        headers: { Key: apiKey },
      });
      return normalizeAbuseipdb(raw);
    },
  };
}
