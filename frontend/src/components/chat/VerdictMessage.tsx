import { RiskMeter } from '../ui/RiskMeter';
import { VerdictBadge } from '../scan/VerdictBadge';
import { SourceReportCard } from '../scan/SourceReportCard';
import { MascotMessage } from './MascotMessage';
import { confidenceLabel, narrativeIntroFor } from '../../lib/verdictPresentation';
import type { Scan, VerdictLevel } from '../../lib/types';
import { assertUnreachable } from '../../lib/types';

/**
 * Glitch temático por nivel (además del `.fx-burst-message` neutro que
 * dispara CUALQUIER mensaje nuevo del personaje — ver
 * docs/architecture/frontend-design.md "Capa de efectos"). `malicious` suma
 * ruido/estática; `unknown` es más silencioso pero violeta; `clean`/
 * `suspicious` sólo llevan el burst neutro. Switch exhaustivo por la misma
 * disciplina que `VerdictBadge`/`RiskMeter`.
 */
function thematicGlitchFor(level: VerdictLevel): string {
  switch (level) {
    case 'malicious':
      return 'fx-burst-malicious fx-noise-burst';
    case 'unknown':
      return 'fx-burst-unknown fx-jitter-confused';
    case 'suspicious':
    case 'clean':
      return '';
    default:
      return assertUnreachable(level);
  }
}

/**
 * Mensaje del personaje con el veredicto. Estructura visual dentro de la
 * burbuja (badge + barra de riesgo + filas por fuente), no prosa pura — pero
 * abre con una frase en primera persona (`narrativeIntroFor`) para que se
 * lea como que el personaje está explicando el resultado.
 */
export function VerdictMessage({ scan }: { scan: Scan }) {
  const level = scan.verdict.level;
  const glitch = `fx-burst-message ${thematicGlitchFor(level)}`.trim();

  return (
    // El avatar de ESTE mensaje reacciona a SU veredicto, no al último scan de la app.
    <MascotMessage scanStatus="success" level={level} glitchClassName={glitch}>
      <div className="flex flex-col gap-3" aria-live="polite">
        <p className="font-mono-pixel text-lg text-pixel-mist">{narrativeIntroFor(level, scan.ioc.value)}</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-pixel text-[9px] text-pixel-fog uppercase mb-1">
              {scan.ioc.type}
              {scan.mock ? ' · modo simulado' : ''}
            </p>
            <p className="font-mono-pixel text-lg text-pixel-glass break-all">{scan.ioc.value}</p>
          </div>
          <VerdictBadge level={level} />
        </div>

        <RiskMeter level={level} score={scan.verdict.score} />

        <p className="font-mono-pixel text-base text-pixel-fog">{confidenceLabel(scan)}</p>

        <p className="font-mono-pixel text-base text-pixel-mist border-l-2 border-pixel-ink2 pl-3">
          {scan.verdict.summary}
        </p>

        {scan.sources.length > 0 ? (
          <div>
            <h3 className="font-pixel text-[9px] text-pixel-fog uppercase mb-2">Detalle por fuente</h3>
            <div className="flex flex-col gap-2">
              {scan.sources.map((sourceReport) => (
                <SourceReportCard key={sourceReport.source} report={sourceReport} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </MascotMessage>
  );
}
