/**
 * Fuente: VirusTotal (reputacion de hashes de archivo).
 *
 * Forma cruda: `last_analysis_stats`, CONTEOS por engine -- no un score. Hay que
 * construir la escala comun a partir de ellos.
 * Umbrales y factor de amplificacion: docs/architecture/domain-model.md, 3.3.
 */

import { fetchJson as defaultFetchJson } from '../../utils/httpClient.js';
import { createSourceReport } from '../../models/verdict.js';
import { SourceError } from '../../utils/errors.js';
import { virustotalMockResponse } from './mocks/virustotal.mock.js';

export const SOURCE_ID = 'virustotal';
const ENDPOINT = 'https://www.virustotal.com/api/v3/files';

/**
 * En VirusTotal 3-5 detecciones sobre ~70 engines ya es senal fuerte, pero el
 * ratio crudo (0.05) caeria en la banda `clean`. Se amplifica para que el corte
 * por conteo y el corte por banda coincidan.
 */
const SCORE_AMPLIFICATION = 8;
const MALICIOUS_ENGINE_THRESHOLD = 3;
const SIGNIFICANT_ENGINE_COUNT = 40;

/** @param {unknown} value @returns {number} */
function asCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Traduce la respuesta cruda de VirusTotal a un SourceReport.
 * @param {unknown} raw
 */
export function normalizeVirustotal(raw) {
  const stats = raw?.data?.attributes?.last_analysis_stats;
  if (!stats || typeof stats !== 'object') {
    throw new SourceError('VirusTotal devolvio una respuesta sin estadisticas de analisis.', {
      source: SOURCE_ID,
      kind: 'bad_response',
    });
  }

  const malicious = asCount(stats.malicious);
  const suspicious = asCount(stats.suspicious);
  const harmless = asCount(stats.harmless);
  const undetected = asCount(stats.undetected);

  // Los engines que dieron timeout no opinaron: no cuentan para el ratio.
  const totalEngines = malicious + suspicious + harmless + undetected;
  if (totalEngines === 0) {
    throw new SourceError('VirusTotal no reporto ningun engine; el ratio no es calculable.', {
      source: SOURCE_ID,
      kind: 'bad_response',
    });
  }

  const detections = malicious + suspicious * 0.5;
  const score = Math.min(100, Math.round((detections / totalEngines) * 100 * SCORE_AMPLIFICATION));

  let level;
  let confidence;
  if (malicious >= MALICIOUS_ENGINE_THRESHOLD) {
    // 1-2 detecciones suelen ser heuristicas ruidosas de engines menores; 3 o
    // mas independientes es el corte que usa la industria.
    level = 'malicious';
    confidence = 0.9;
  } else if (malicious > 0 || suspicious > 0) {
    level = 'suspicious';
    confidence = 0.6;
  } else {
    level = 'clean';
    confidence = totalEngines >= SIGNIFICANT_ENGINE_COUNT ? 0.6 : 0.3;
  }

  return createSourceReport({
    source: SOURCE_ID,
    level,
    score,
    confidence,
    details: {
      malicious,
      suspicious,
      harmless,
      undetected,
      totalEngines,
      fileName: raw.data.attributes.meaningful_name ?? null,
      fileType: raw.data.attributes.type_description ?? null,
    },
  });
}

/** Un hash que VirusTotal no conoce no es un fallo: es informacion (debil). */
function unknownFileReport() {
  return createSourceReport({
    source: SOURCE_ID,
    level: 'clean',
    score: 0,
    confidence: 0.2,
    details: { reason: 'unknown_file', totalEngines: 0 },
  });
}

/**
 * @param {object} options
 * @param {boolean} options.useMock
 * @param {string} [options.apiKey]
 * @param {number} [options.timeoutMs]
 * @param {typeof defaultFetchJson} [options.fetchJson]  Inyectable para tests.
 */
export function createVirustotalSource({
  useMock,
  apiKey,
  timeoutMs,
  fetchJson = defaultFetchJson,
}) {
  return {
    id: SOURCE_ID,
    supports: (iocType) => iocType === 'hash',
    async lookup(ioc) {
      if (useMock) {
        return normalizeVirustotal(virustotalMockResponse(ioc));
      }
      try {
        // `ioc.value` ya paso la validacion de hash: solo [0-9a-f]. Se codifica
        // igualmente por si esa invariante cambiara.
        const raw = await fetchJson(`${ENDPOINT}/${encodeURIComponent(ioc.value)}`, {
          source: SOURCE_ID,
          timeoutMs,
          headers: { 'x-apikey': apiKey },
        });
        return normalizeVirustotal(raw);
      } catch (error) {
        if (error?.httpStatus === 404) return unknownFileReport();
        throw error;
      }
    },
  };
}
