/**
 * Formato compartido del estado de cuota (`GET /api/quota`) — misma
 * información, dos densidades: `quotaSourceLine` para el mensaje completo
 * (`QuotaMessage.tsx`, una línea por fuente) y `quotaCompactSummary` para el
 * footer de una sola línea dentro de `VerdictMessage.tsx`. Ninguno de los dos
 * componentes duplica este texto.
 */
import { SOURCE_LABEL } from '../components/scan/sourceLabels';
import type { QuotaSourceStatus } from './types';

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

function formatResetTime(resetAt: string): string | null {
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** "AbuseIPDB: quedan 997 de 1000 hoy (reinicia 08/08 00:00)." / "URLhaus: sin límite conocido — van 5 consultas hoy." */
export function quotaSourceLine(source: QuotaSourceStatus): string {
  const label = sourceLabel(source.source);
  if (source.unlimited) {
    return `${label}: sin límite conocido — van ${source.used} consultas hoy.`;
  }
  const resetText = source.resetAt ? formatResetTime(source.resetAt) : null;
  const resetSuffix = resetText ? ` (reinicia ${resetText})` : '';
  return `${label}: quedan ${source.remaining} de ${source.limit} hoy${resetSuffix}.`;
}

/** "AbuseIPDB 997/1000 · VirusTotal 488/500 · URLhaus sin límite" */
export function quotaCompactSummary(sources: QuotaSourceStatus[]): string {
  return sources
    .map((source) => {
      const label = sourceLabel(source.source);
      return source.unlimited ? `${label} sin límite` : `${label} ${source.remaining}/${source.limit}`;
    })
    .join(' · ');
}
