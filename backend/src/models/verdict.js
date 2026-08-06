/**
 * Veredicto y reportes de fuente.
 *
 * `SourceReport` es la forma comun a la que la capa de normalizacion traduce a
 * las tres fuentes. Fuera de `services/sources/` nadie conoce
 * `abuseConfidenceScore` ni `last_analysis_stats`.
 *
 * Umbrales y reglas de agregacion: docs/architecture/domain-model.md, seccion 3.
 */

/** @type {readonly ('clean'|'suspicious'|'malicious')[]} */
export const VERDICT_LEVELS = Object.freeze(['clean', 'suspicious', 'malicious']);

/** Bandas comunes: [piso, techo] de score por nivel. */
const BANDS = Object.freeze({
  clean: [0, 24],
  suspicious: [25, 74],
  malicious: [75, 100],
});

/**
 * @param {number} score 0..100
 * @returns {'clean'|'suspicious'|'malicious'}
 */
export function levelForScore(score) {
  if (score >= BANDS.malicious[0]) return 'malicious';
  if (score >= BANDS.suspicious[0]) return 'suspicious';
  return 'clean';
}

/**
 * Fuerza la coherencia entre `level` y `score`.
 *
 * Algunas fuentes deciden el nivel por conteo (VirusTotal: >= 3 engines) y no
 * por su score crudo. Sin este ajuste un reporte podria decir `malicious` con
 * score 34, y la agregacion -- que deriva el nivel del score -- lo degradaria a
 * `suspicious`. El score se mueve al borde mas cercano de su banda.
 *
 * @param {number} score
 * @param {'clean'|'suspicious'|'malicious'} level
 * @returns {number}
 */
export function clampScoreToLevel(score, level) {
  const [floor, ceiling] = BANDS[level];
  return Math.min(Math.max(Math.round(score), floor), ceiling);
}

/**
 * @param {object} input
 * @param {string} input.source
 * @param {'clean'|'suspicious'|'malicious'} input.level
 * @param {number} input.score
 * @param {number} input.confidence 0..1
 * @param {object} [input.details]
 */
export function createSourceReport({ source, level, score, confidence, details = {} }) {
  return Object.freeze({
    source,
    level,
    score: clampScoreToLevel(score, level),
    confidence: Number(confidence.toFixed(2)),
    details: Object.freeze({ ...details }),
    queriedAt: new Date().toISOString(),
    degraded: false,
  });
}

/**
 * Reporte de relleno cuando una fuente falla (ADR 3): no rompe el scan, pero
 * tampoco finge tener informacion -- `confidence: 0` y `degraded: true`.
 *
 * @param {string} source
 * @param {'timeout'|'rate_limit'|'unavailable'|'bad_response'} reason
 */
export function degradedSourceReport(source, reason) {
  return Object.freeze({
    source,
    level: 'clean',
    score: 0,
    confidence: 0,
    details: Object.freeze({ reason }),
    queriedAt: new Date().toISOString(),
    degraded: true,
  });
}

/**
 * @param {'clean'|'suspicious'|'malicious'} level
 * @param {number} agreeing
 * @param {number} total
 * @returns {string}
 */
function summarise(level, agreeing, total) {
  if (total === 0) return 'Ninguna fuente respondio; el veredicto no es concluyente.';
  const suffix = `${agreeing} de ${total} fuente(s) consultada(s)`;
  if (level === 'malicious') return `Reportado como malicioso por ${suffix}.`;
  if (level === 'suspicious') return `Indicios sospechosos en ${suffix}.`;
  return `Sin reportes en ${total} fuente(s) consultada(s).`;
}

/**
 * Agrega N SourceReports en un unico Verdict.
 *
 * - `score` = maximo de las fuentes no degradadas (ADR 2: una fuente que grita
 *   "malicioso" pesa mas que dos que dicen "no lo conozco"; promediar diluiria
 *   la senal).
 * - `level` se deriva del score agregado.
 * - `confidence` = media de las confianzas no degradadas, escalada por la
 *   fraccion de fuentes que efectivamente respondieron.
 *
 * @param {ReturnType<typeof createSourceReport>[]} reports
 */
export function aggregateVerdict(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('aggregateVerdict requiere al menos un SourceReport.');
  }

  const answered = reports.filter((report) => !report.degraded);

  if (answered.length === 0) {
    return Object.freeze({
      level: 'clean',
      score: 0,
      confidence: 0,
      summary: summarise('clean', 0, 0),
    });
  }

  const score = Math.max(...answered.map((report) => report.score));
  const level = levelForScore(score);
  const meanConfidence =
    answered.reduce((sum, report) => sum + report.confidence, 0) / answered.length;
  const coverage = answered.length / reports.length;
  const agreeing = answered.filter((report) => report.level === level).length;

  return Object.freeze({
    level,
    score,
    confidence: Number((meanConfidence * coverage).toFixed(2)),
    summary: summarise(level, agreeing, reports.length),
  });
}
