import type { VerdictLevel } from '../../lib/types';
import { assertUnreachable } from '../../lib/types';

/**
 * Los 4 estados visuales de la mascota. `confused` es el estado propio de
 * `unknown` — nunca se reutiliza `calm` (verde) para él. Ver
 * docs/architecture/domain-model.md ADR 3 y frontend-design.md §4.
 */
export type MascotState = 'idle' | 'scanning' | 'calm' | 'alert' | 'confused';

/** Columna del sprite sheet (4 columnas: idle | calm | alert | confused). `scanning` reutiliza la columna `idle` — se anima más rápido, no cambia de pose. */
export const SPRITE_COLUMN: Record<MascotState, 0 | 1 | 2 | 3> = {
  idle: 0,
  scanning: 0,
  calm: 1,
  alert: 2,
  confused: 3,
};

/**
 * Deriva el estado de la mascota a partir del ciclo de vida de la consulta.
 * Rama explícita para cada nivel de veredicto — si en el futuro se agrega un
 * 5º nivel, `assertUnreachable` rompe el build hasta que se le dé una rama.
 */
export function mascotStateFor(
  scanStatus: 'idle' | 'loading' | 'success' | 'error',
  level: VerdictLevel | null,
): MascotState {
  if (scanStatus === 'loading') return 'scanning';
  if (scanStatus !== 'success' || level === null) return 'idle';

  switch (level) {
    case 'clean':
      return 'calm';
    case 'suspicious':
    case 'malicious':
      return 'alert';
    case 'unknown':
      // La trampa del contrato: `unknown` NUNCA se pinta en verde ni cae en
      // un `else` junto a `clean`. Tiene su propio estado, `confused`.
      return 'confused';
    default:
      return assertUnreachable(level);
  }
}

/** Color de halo alrededor de la mascota. Para `alert`, distingue ámbar (sospechoso) de rojo (malicioso) sin necesitar un sprite adicional. */
export function haloClassFor(state: MascotState, level: VerdictLevel | null): string {
  if (state === 'confused') return 'shadow-[0_0_24px_4px_rgba(155,140,255,0.45)]';
  if (state === 'calm') return 'shadow-[0_0_24px_4px_rgba(61,220,132,0.4)]';
  if (state === 'alert') {
    return level === 'malicious'
      ? 'shadow-[0_0_24px_4px_rgba(229,72,77,0.5)]'
      : 'shadow-[0_0_24px_4px_rgba(245,197,66,0.45)]';
  }
  if (state === 'scanning') return 'shadow-[0_0_18px_3px_rgba(220,232,255,0.35)]';
  return 'shadow-none';
}

/**
 * Nombres de clase COMPLETOS y literales (no template strings) para que el
 * escaneo estático de Tailwind los detecte — `animate-mascot-${state}` no
 * funcionaría porque Tailwind no evalúa JS, sólo busca substrings exactos.
 */
export const ANIMATION_CLASS: Record<MascotState, string> = {
  idle: 'animate-mascot-idle',
  scanning: 'animate-mascot-scanning',
  calm: 'animate-mascot-calm',
  alert: 'animate-mascot-alert',
  confused: 'animate-mascot-confused',
};

export const STATE_LABEL: Record<MascotState, string> = {
  idle: 'En espera',
  scanning: 'Escaneando…',
  calm: 'Tranquilo — IOC limpio',
  alert: 'Alerta — riesgo detectado',
  confused: 'Confundido — no se pudo evaluar',
};
