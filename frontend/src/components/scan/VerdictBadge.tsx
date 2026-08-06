import type { VerdictLevel } from '../../lib/types';
import { assertUnreachable } from '../../lib/types';

const LEVEL_STYLE: Record<VerdictLevel, string> = {
  clean: 'bg-pixel-clean/15 text-pixel-clean border-pixel-clean',
  suspicious: 'bg-pixel-suspicious/15 text-pixel-suspicious border-pixel-suspicious',
  malicious: 'bg-pixel-malicious/15 text-pixel-malicious border-pixel-malicious',
  unknown: 'bg-pixel-unknown/15 text-pixel-unknown border-pixel-unknown',
};

/**
 * Texto del badge por nivel. Deliberadamente NO se deriva con
 * `level.toUpperCase()` como fallback genérico para `unknown`: se escribe la
 * palabra completa para cada uno de los 4 casos, así un nuevo nivel que se
 * agregue algún día no hereda un texto por defecto sin revisión.
 */
function labelFor(level: VerdictLevel): string {
  switch (level) {
    case 'clean':
      return 'LIMPIO';
    case 'suspicious':
      return 'SOSPECHOSO';
    case 'malicious':
      return 'MALICIOSO';
    case 'unknown':
      return 'DESCONOCIDO';
    default:
      return assertUnreachable(level);
  }
}

export function VerdictBadge({ level }: { level: VerdictLevel }) {
  return (
    <span
      className={`inline-block font-pixel text-xs px-3 py-2 border-2 ${LEVEL_STYLE[level]}`}
    >
      {labelFor(level)}
    </span>
  );
}
