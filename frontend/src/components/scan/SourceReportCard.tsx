import type { DegradedReason, SourceReport } from '../../lib/types';
import { enrichedDetailRows } from '../../lib/verdictPresentation';
import { VerdictBadge } from './VerdictBadge';

const SOURCE_LABEL: Record<string, string> = {
  abuseipdb: 'AbuseIPDB',
  virustotal: 'VirusTotal',
  urlhaus: 'URLhaus',
};

const REASON_LABEL: Record<DegradedReason, string> = {
  timeout: 'La fuente no respondió a tiempo (timeout).',
  rate_limit: 'Límite de consultas de la fuente alcanzado (rate limit).',
  unavailable: 'La fuente no está disponible en este momento.',
  bad_response: 'La fuente devolvió una respuesta con forma inesperada.',
};

/**
 * Tarjeta por fuente. Regla dura: una fuente `degraded` no es "otra opinión
 * más" — es la ausencia de una. Se muestra visualmente distinta (borde
 * punteado, sin score) y con el motivo (`details.reason`) cuando existe.
 */
export function SourceReportCard({ report }: { report: SourceReport }) {
  const label = SOURCE_LABEL[report.source] ?? report.source;
  const reason = typeof report.details?.reason === 'string' ? (report.details.reason as DegradedReason) : null;
  const enriched = report.degraded ? [] : enrichedDetailRows(report);

  return (
    <div
      className={`border-2 p-3 bg-pixel-ink ${report.degraded ? 'border-dashed border-pixel-unknown' : 'border-pixel-ink2'}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-pixel text-xs text-pixel-glass">{label}</span>
        <VerdictBadge level={report.level} />
      </div>

      {report.degraded ? (
        <p className="mt-2 text-base text-pixel-unknown font-mono-pixel">
          Sin observación de esta fuente.
          {reason ? ` ${REASON_LABEL[reason]}` : ''}
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-base font-mono-pixel text-pixel-mist">
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <dt className="text-pixel-fog">score</dt>
            <dd>{report.score === null ? '—' : report.score}</dd>
          </div>
          <div className="flex justify-between col-span-2 sm:col-span-1">
            <dt className="text-pixel-fog">confianza</dt>
            <dd>{Math.round(report.confidence * 100)}%</dd>
          </div>
        </dl>
      )}

      {/* Campos enriquecidos opcionales (categories/usageType/domain,
          threatCategory/threatLabel/threatNames, tags/threatType) — el
          backend los agrega en paralelo; ver lib/verdictPresentation.ts.
          Nunca degradado: una fuente caída no tiene enriquecimiento que
          mostrar, ya cubierto arriba por el mensaje "Sin observación". */}
      {!report.degraded ? (
        <dl className="mt-2 pt-2 border-t border-pixel-ink2 flex flex-col gap-1 text-base font-mono-pixel text-pixel-mist">
          {enriched.length > 0 ? (
            enriched.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-pixel-fog shrink-0">{row.label}</dt>
                <dd className="text-right break-words">{row.value}</dd>
              </div>
            ))
          ) : (
            <p className="text-pixel-fog italic">sin información adicional de la fuente</p>
          )}
        </dl>
      ) : null}
    </div>
  );
}
