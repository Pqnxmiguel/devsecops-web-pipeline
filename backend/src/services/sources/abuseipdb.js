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
 * Tabla oficial de categorias de reporte de AbuseIPDB.
 * Fuente: https://www.abuseipdb.com/categories (consultada 2026-08-06).
 * Un codigo que no aparezca aqui (categoria nueva, retirada, o dato corrupto)
 * cae a un fallback legible en vez de lanzar: la narrativa es "mejor
 * esfuerzo", nunca debe tumbar la normalizacion.
 */
const ABUSE_CATEGORIES = Object.freeze({
  1: 'DNS Compromise',
  2: 'DNS Poisoning',
  3: 'Fraud Orders',
  4: 'DDoS Attack',
  5: 'FTP Brute-Force',
  6: 'Ping of Death',
  7: 'Phishing',
  8: 'Fraud VoIP',
  9: 'Open Proxy',
  10: 'Web Spam',
  11: 'Email Spam',
  12: 'Blog Spam',
  13: 'VPN IP',
  14: 'Port Scan',
  15: 'Hacking',
  16: 'SQL Injection',
  17: 'Spoofing',
  18: 'Brute-Force',
  19: 'Bad Web Bot',
  20: 'Exploited Host',
  21: 'Web App Attack',
  22: 'SSH',
  23: 'IoT Targeted',
});

/** @param {number} code @returns {string} */
function labelForCategory(code) {
  return ABUSE_CATEGORIES[code] ?? `Categoría ${code}`;
}

/**
 * Une (deduplicada) las categorias de todos los reportes de la IP.
 * `data.reports` puede faltar del todo (plan gratuito, o simplemente no
 * incluido en la respuesta): en ese caso no hay nada que traducir.
 * @param {unknown} reports
 * @returns {string[]}
 */
function extractCategories(reports) {
  if (!Array.isArray(reports)) return [];
  const codes = new Set();
  for (const report of reports) {
    const categories = report?.categories;
    if (!Array.isArray(categories)) continue;
    for (const code of categories) codes.add(code);
  }
  return [...codes].map(labelForCategory);
}

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
      usageType: data.usageType ?? null,
      domain: data.domain ?? null,
      categories: extractCategories(data.reports),
    },
  });
}

/**
 * Lee las 3 cabeceras de rate limit de AbuseIPDB, si vinieron y son numericas.
 * Nunca reenvia headers arbitrarios del proveedor: solo estos tres.
 * @param {Headers} headers
 * @returns {{limit: number, remaining: number, resetAt: string} | undefined}
 */
function readRateLimitHeaders(headers) {
  const limit = Number(headers.get('x-ratelimit-limit'));
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const resetEpochSeconds = Number(headers.get('x-ratelimit-reset'));
  if (![limit, remaining, resetEpochSeconds].every(Number.isFinite)) return undefined;
  return { limit, remaining, resetAt: new Date(resetEpochSeconds * 1000).toISOString() };
}

/**
 * @param {object} options
 * @param {boolean} options.useMock
 * @param {string} [options.apiKey]
 * @param {number} [options.timeoutMs]
 * @param {typeof defaultFetchJson} [options.fetchJson]  Inyectable para tests.
 * @param {ReturnType<typeof import('../quota/quotaTracker.js').createQuotaTracker>} [options.quotaTracker]
 *   Solo se usa cuando `useMock` es false.
 */
export function createAbuseipdbSource({
  useMock,
  apiKey,
  timeoutMs,
  fetchJson = defaultFetchJson,
  quotaTracker,
}) {
  return {
    id: SOURCE_ID,
    supports: (iocType) => iocType === 'ip',
    async lookup(ioc) {
      if (useMock) {
        return normalizeAbuseipdb(abuseipdbMockResponse(ioc));
      }

      // Gating de cuota: si el tracker dice que no queda margen, se corta
      // ANTES de tocar la red -- reusa el mismo `kind: 'rate_limit'` que ya
      // maneja `httpClient.js` en un 429 real, asi `scanService.js` lo
      // absorbe sin ningun cambio.
      if (quotaTracker && !quotaTracker.canConsume(SOURCE_ID)) {
        throw new SourceError(
          `La fuente ${SOURCE_ID} alcanzo su cuota diaria; no se intento la llamada real.`,
          { source: SOURCE_ID, kind: 'rate_limit' },
        );
      }

      const query = new URLSearchParams({
        ipAddress: ioc.value,
        maxAgeInDays: String(MAX_AGE_IN_DAYS),
      });

      let rateLimitHeaders;
      try {
        const raw = await fetchJson(`${ENDPOINT}?${query}`, {
          source: SOURCE_ID,
          timeoutMs,
          // La API key viaja en cabecera, nunca en la query string: las URLs
          // acaban en logs de proxy y de acceso.
          headers: { Key: apiKey },
          onHeaders: quotaTracker
            ? (headers) => {
                rateLimitHeaders = readRateLimitHeaders(headers);
              }
            : undefined,
        });
        // Contador propio primero; si vino el header (la verdad), lo
        // sobreescribe a continuacion. El orden importa: reconcile corrige
        // cualquier drift que el incremento optimista haya introducido.
        quotaTracker?.recordUsage(SOURCE_ID);
        if (quotaTracker && rateLimitHeaders) {
          quotaTracker.reconcileFromHeaders(SOURCE_ID, rateLimitHeaders);
        }
        return normalizeAbuseipdb(raw);
      } catch (error) {
        // Caso defensivo: nuestro contador decia que habia margen pero el
        // proveedor igual respondio 429. Se fuerza el agotamiento para no
        // seguir gastando intentos reales el resto del dia.
        if (quotaTracker && error instanceof SourceError && error.kind === 'rate_limit') {
          quotaTracker.markExhausted(SOURCE_ID);
        }
        throw error;
      }
    },
  };
}
