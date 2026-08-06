/**
 * Veredicto y reportes de fuente.
 *
 * `SourceReport` es la forma comun a la que la capa de normalizacion traduce a
 * las tres fuentes. Fuera de `services/sources/` nadie conoce
 * `abuseConfidenceScore` ni `last_analysis_stats`.
 *
 * Reglas de agregacion: docs/architecture/domain-model.md seccion 2.4.
 * Umbrales de normalizacion: seccion 3.
 */

/**
 * Niveles que SI viven en la escala numerica 0..100, de menor a mayor
 * severidad. Son los unicos que un `SourceReport` puede llevar y los unicos
 * que se pueden derivar de un score.
 * @type {readonly ('clean'|'suspicious'|'malicious')[]}
 */
export const SCORED_LEVELS = Object.freeze(['clean', 'suspicious', 'malicious']);

/**
 * `unknown` = "no se pudo evaluar". NO es un punto de la escala: no es un
 * `clean` con poca confianza, es la ausencia de juicio. Por eso queda fuera de
 * `SCORED_LEVELS`, no tiene banda de score y nunca participa en la comparacion
 * de maximo. Ver ADR 3 (revisado) en docs/architecture/domain-model.md.
 */
export const UNKNOWN_LEVEL = 'unknown';

/** @type {readonly ('clean'|'suspicious'|'malicious'|'unknown')[]} */
export const VERDICT_LEVELS = Object.freeze([...SCORED_LEVELS, UNKNOWN_LEVEL]);

/** Bandas comunes: [piso, techo] de score por nivel. `unknown` no tiene banda. */
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
  // Sin esta guarda `levelForScore(null)` devolveria 'clean' (null >= 25 es
  // false), que es justo el fallo que este modulo tiene prohibido: un ausente
  // convertido en "limpio". Un score no numerico es un bug, no un veredicto.
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new TypeError(`levelForScore requiere un score numerico; se recibio ${String(score)}.`);
  }
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
  const band = BANDS[level];
  if (!band) {
    // Incluye `unknown`: no tiene banda porque no tiene score. Fallar aqui es
    // preferible a inventar 0, que se leeria como "medido y limpio".
    throw new TypeError(`El nivel "${String(level)}" no tiene banda de score.`);
  }
  const [floor, ceiling] = band;
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
  // Una fuente que responde emite un juicio en la escala. `unknown` es
  // exclusivo de `degradedSourceReport`: si se pudiera construir un reporte
  // `unknown` no degradado, la agregacion tendria que decidir que hacer con un
  // nivel sin score, y ese es exactamente el agujero que se esta cerrando.
  if (!SCORED_LEVELS.includes(level)) {
    throw new TypeError(
      `createSourceReport solo admite ${SCORED_LEVELS.join('|')}; se recibio "${String(level)}". ` +
        'Para una fuente que no pudo responder usa degradedSourceReport().',
    );
  }
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
 * Reporte de relleno cuando una fuente falla (ADR 3, revisado): no rompe el
 * scan, pero tampoco finge tener informacion. `level: 'unknown'` y
 * `score: null` -- una fuente caida no observo nada, y `clean`/`0` seria una
 * observacion inventada (CWE-636).
 *
 * @param {string} source
 * @param {'timeout'|'rate_limit'|'unavailable'|'bad_response'} reason
 */
export function degradedSourceReport(source, reason) {
  return Object.freeze({
    source,
    level: UNKNOWN_LEVEL,
    score: null,
    confidence: 0,
    details: Object.freeze({ reason }),
    queriedAt: new Date().toISOString(),
    degraded: true,
  });
}

/**
 * Decide si un reporte aporta evidencia utilizable para el veredicto.
 *
 * Las tres condiciones son redundantes entre si a proposito: cualquiera de
 * ellas basta para excluir un reporte degradado. Es la barrera que impide que
 * un reporte sin observacion real acabe contando como una fuente que respondio.
 *
 * @param {object} report
 * @returns {boolean}
 */
export function isConclusiveReport(report) {
  return (
    Boolean(report) &&
    report.degraded !== true &&
    SCORED_LEVELS.includes(report.level) &&
    typeof report.score === 'number' &&
    Number.isFinite(report.score)
  );
}

/**
 * @param {'clean'|'suspicious'|'malicious'} level
 * @param {number} agreeing
 * @param {number} answered
 * @param {number} total
 * @returns {string}
 */
function summarise(level, agreeing, answered, total) {
  const consulted = `${total} fuente(s) consultada(s)`;
  const degradedNote = answered < total ? ` ${total - answered} no respondio(eron).` : '';
  if (level === 'malicious') {
    return `Reportado como malicioso por ${agreeing} de ${consulted}.${degradedNote}`;
  }
  if (level === 'suspicious') {
    return `Indicios sospechosos en ${agreeing} de ${consulted}.${degradedNote}`;
  }
  return `Sin reportes en ${answered} de ${consulted}.${degradedNote}`;
}

/**
 * Veredicto no concluyente: ninguna fuente llego a evaluar el IOC.
 * @param {number} total  Fuentes consultadas (todas degradadas).
 */
function unknownVerdict(total) {
  return Object.freeze({
    level: UNKNOWN_LEVEL,
    // `null`, no `0`: un consumidor que ordene o compare por score no debe ver
    // este scan como "el menos malicioso". No hay medicion que ordenar.
    score: null,
    confidence: 0,
    summary:
      `Ninguna fuente respondio (${total} consultada(s)): el IOC no pudo evaluarse. ` +
      'Esto NO significa que sea limpio.',
  });
}

/**
 * Agrega N SourceReports en un unico Verdict.
 *
 * Regla (ver domain-model.md seccion 2.4):
 *
 * 1. Se parte en dos: reportes CONCLUYENTES (`isConclusiveReport`) y el resto.
 * 2. Si no hay ninguno concluyente -> `unknown`, `score: null`,
 *    `confidence: 0`. Nunca `clean`.
 * 3. Si hay al menos uno -> `score` = maximo de los concluyentes (ADR 2) y
 *    `level` se deriva de ese score. Los degradados no arrastran el resultado
 *    ni hacia arriba ni hacia abajo.
 * 4. `confidence` = media de las confianzas concluyentes, escalada por la
 *    cobertura (concluyentes / consultadas). Los degradados SI penalizan aqui,
 *    y siguen apareciendo en `sources[]` con `degraded: true`.
 *
 * @param {ReturnType<typeof createSourceReport>[]} reports
 */
export function aggregateVerdict(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('aggregateVerdict requiere al menos un SourceReport.');
  }

  const answered = reports.filter(isConclusiveReport);

  if (answered.length === 0) {
    return unknownVerdict(reports.length);
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
    summary: summarise(level, agreeing, answered.length, reports.length),
  });
}
