import type { VerdictLevel } from '../../lib/types';
import { assertUnreachable } from '../../lib/types';

const LEVEL_COLOR: Record<VerdictLevel, string> = {
  clean: 'bg-pixel-clean',
  suspicious: 'bg-pixel-suspicious',
  malicious: 'bg-pixel-malicious',
  unknown: 'bg-pixel-unknown',
};

function trackWidthFor(level: VerdictLevel, score: number | null): number {
  if (level === 'unknown') return 100; // barra llena en violeta, NUNCA "0/vacía"
  if (score === null) {
    // No debería ocurrir (score es null ⟺ level === 'unknown'), pero si el
    // backend algún día lo violase, preferimos gritarlo en vez de dibujar 0.
    return 100;
  }
  return Math.max(4, Math.min(100, score));
}

interface RiskMeterProps {
  level: VerdictLevel;
  score: number | null;
}

/**
 * Barra de riesgo. Regla dura del contrato: `score` puede ser `null` cuando
 * `level === 'unknown'`, y eso NUNCA se dibuja como "0/100" — se dibuja como
 * una barra llena en el color `unknown`, con la etiqueta "— sin datos —".
 */
export function RiskMeter({ level, score }: RiskMeterProps) {
  const isUnknown = level === 'unknown';
  const label = isUnknown || score === null ? '— sin datos —' : `${score}/100`;

  switch (level) {
    case 'clean':
    case 'suspicious':
    case 'malicious':
    case 'unknown':
      break;
    default:
      assertUnreachable(level);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-pixel text-[10px] text-pixel-fog uppercase">Score</span>
        <span
          className={`font-mono-pixel text-lg ${isUnknown ? 'text-pixel-unknown' : 'text-pixel-glass'}`}
        >
          {label}
        </span>
      </div>
      <div
        className="h-4 w-full bg-pixel-ink border-2 border-pixel-ink2 overflow-hidden"
        role="img"
        aria-label={isUnknown ? 'Score no disponible: el IOC no pudo evaluarse' : `Score de riesgo: ${label}`}
      >
        <div
          className={`h-full ${LEVEL_COLOR[level]} ${isUnknown ? 'opacity-40 [background-image:repeating-linear-gradient(45deg,rgba(0,0,0,0.3)_0,rgba(0,0,0,0.3)_4px,transparent_4px,transparent_8px)]' : ''}`}
          style={{ width: `${trackWidthFor(level, score)}%` }}
        />
      </div>
    </div>
  );
}
