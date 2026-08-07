/**
 * Traduce un `Scan`/`SourceReport` crudo al vocabulario que el personaje usa
 * para "hablar" en el chat: una frase corta según el nivel, y las filas
 * clave-valor de los campos enriquecidos por fuente.
 *
 * Los campos enriquecidos (`categories`/`usageType`/`domain` para IP;
 * `threatCategory`/`threatLabel`/`threatNames` para hash; `tags`/
 * `threatType` para dominio) los está agregando `backend-builder` en
 * paralelo a este trabajo — TODOS son opcionales/nullable hoy mismo. Esta
 * capa es la única responsable de que su ausencia nunca se filtre como
 * "undefined" ni rompa el render: si no hay nada que mostrar, se devuelve
 * una lista vacía y el componente de chat cae al mensaje
 * "sin información adicional de la fuente".
 */
import type { Scan, SourceReport, VerdictLevel } from './types';
import { assertUnreachable } from './types';

export interface DetailRow {
  label: string;
  value: string;
}

const ENRICHED_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  abuseipdb: [
    { key: 'categories', label: 'Categorías' },
    { key: 'usageType', label: 'Tipo de uso' },
    { key: 'domain', label: 'Dominio asociado' },
  ],
  virustotal: [
    { key: 'threatCategory', label: 'Categoría de amenaza' },
    { key: 'threatLabel', label: 'Etiqueta' },
    { key: 'threatNames', label: 'Nombres de amenaza' },
  ],
  urlhaus: [
    { key: 'tags', label: 'Tags' },
    { key: 'threatType', label: 'Tipo de amenaza' },
  ],
};

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/** Convierte un valor `unknown` (string | number | boolean | array | null | undefined) a texto mostrable, o `null` si no hay nada que mostrar. Nunca devuelve la cadena "undefined"/"null". */
function asDisplayString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (isNonEmptyArray(value)) {
    const parts = value.map((v) => String(v)).filter((v) => v.trim() !== '');
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return null;
}

/**
 * Filas clave-valor de los campos enriquecidos de UNA fuente. Lista vacía
 * ⟺ "sin información adicional de la fuente" — el componente decide el
 * texto de fallback, esta función solo garantiza que nunca devuelve basura.
 */
export function enrichedDetailRows(report: SourceReport): DetailRow[] {
  const fields = ENRICHED_FIELDS[report.source] ?? [];
  const rows: DetailRow[] = [];
  for (const { key, label } of fields) {
    const display = asDisplayString(report.details?.[key]);
    if (display !== null) rows.push({ label, value: display });
  }
  return rows;
}

/**
 * Frase corta en primera persona del personaje al abrir el mensaje de
 * veredicto — antes del detalle estructurado (badges/filas). Switch
 * exhaustivo: un 5º nivel futuro rompe el build hasta tener su propia frase,
 * misma disciplina que `VerdictBadge`/`RiskMeter`.
 */
export function narrativeIntroFor(level: VerdictLevel, iocValue: string): string {
  switch (level) {
    case 'clean':
      return `Revisé "${iocValue}" en las fuentes. No encontré nada que lo marque como amenaza.`;
    case 'suspicious':
      return `Cuidado con "${iocValue}": hay señales sospechosas, aunque no es una confirmación total.`;
    case 'malicious':
      return `Alerta. "${iocValue}" está reportado como malicioso — no interactúes con eso.`;
    case 'unknown':
      return `No pude sacar una conclusión sobre "${iocValue}": las fuentes no respondieron esta vez.`;
    default:
      return assertUnreachable(level);
  }
}

/** Texto de confianza, apto para una sola línea corta dentro de la burbuja. */
export function confidenceLabel(scan: Scan): string {
  return `${Math.round(scan.verdict.confidence * 100)}% de confianza`;
}
