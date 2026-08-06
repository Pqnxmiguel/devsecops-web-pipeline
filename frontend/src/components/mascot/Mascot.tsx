import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { VerdictLevel } from '../../lib/types';
import { ANIMATION_CLASS, haloClassFor, mascotStateFor, SPRITE_COLUMN, STATE_LABEL } from './mascotState';
import { NATIVE_FRAME_H, NATIVE_FRAME_W, SHEET_COLS, SHEET_ROWS } from './spriteSheet';

interface MascotProps {
  scanStatus: 'idle' | 'loading' | 'success' | 'error';
  level: VerdictLevel | null;
  /** Alto en px del sprite renderizado; el ancho se deriva de la proporción real del frame (32×40, no cuadrado — ver spriteSheet.ts). */
  size?: number;
}

/** CSSProperties no declara variables custom (`--x`); se extiende localmente en vez de castear a `any`. */
type StyleWithCssVars = CSSProperties & { '--mascot-frame'?: string };

/** Duración de cada ráfaga de glitch, debe coincidir con `.fx-burst-*` en styles/index.css. */
const BURST_DURATION_MS: Record<'malicious' | 'unknown', number> = { malicious: 560, unknown: 480 };
const BURST_CLASS: Record<'malicious' | 'unknown', string> = {
  malicious: 'fx-burst-malicious',
  unknown: 'fx-burst-unknown',
};

/**
 * La mascota, aislada del resto de la app: sólo conoce `scanStatus` y
 * `level`, nunca el objeto `Scan` completo. Animación de sprite 100% CSS
 * (`background-position` + `steps()`, ver tailwind.config.js
 * `animation.mascot-*`) — cero dependencias, `framer-motion` no se usa aquí
 * (regla dura del agente).
 *
 * La capa de glitch (ver docs/architecture/frontend-design.md §8) vive en
 * TRES nodos anidados a propósito, para que ninguna de sus animaciones CSS
 * pise a otra en el mismo elemento (dos clases con `animation` en el mismo
 * nodo se cancelarían entre sí, no se combinan):
 *   - nodo externo (halo): `transition-shadow` + jitter CONTINUO
 *     (`fx-jitter-confused` / `fx-jitter-scanning`), nunca ambos a la vez
 *     porque son estados mutuamente excluyentes.
 *   - nodo medio: ráfaga de UN SOLO ciclo al revelarse un veredicto
 *     `malicious`/`unknown` (`fx-burst-*`) — puede coexistir con el jitter
 *     continuo del nodo externo (p.ej. `confused` + ráfaga `unknown` a la
 *     vez), por eso necesita ser un nodo propio.
 *   - nodo interno (ya existía): el ciclo del sprite (`ANIMATION_CLASS`).
 */
export function Mascot({ scanStatus, level, size = 128 }: MascotProps) {
  const state = mascotStateFor(scanStatus, level);
  const column = SPRITE_COLUMN[state];
  const scale = size / NATIVE_FRAME_H;
  const width = NATIVE_FRAME_W * scale;

  // Ráfaga de glitch al REVELARSE un veredicto malicious/unknown — se
  // dispara en el flanco `loading -> success`, no en cada render, así una
  // segunda consulta al mismo IOC (mismo `level`) también vuelve a
  // glitchear en vez de quedarse "pegada" desde la primera vez.
  const prevStatus = useRef(scanStatus);
  const [burst, setBurst] = useState<'malicious' | 'unknown' | null>(null);

  useEffect(() => {
    const justArrived = prevStatus.current === 'loading' && scanStatus === 'success';
    prevStatus.current = scanStatus;
    if (!justArrived || (level !== 'malicious' && level !== 'unknown')) return undefined;

    setBurst(level);
    const timeout = setTimeout(() => setBurst(null), BURST_DURATION_MS[level]);
    return () => clearTimeout(timeout);
  }, [scanStatus, level]);

  const continuousJitterClass =
    state === 'confused' ? 'fx-jitter-confused' : state === 'scanning' ? 'fx-jitter-scanning' : '';
  const burstClass = burst ? BURST_CLASS[burst] : '';

  const style: StyleWithCssVars = {
    width,
    height: size,
    backgroundImage: 'url(/sprites/mascot.png)',
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${NATIVE_FRAME_W * SHEET_COLS * scale}px ${NATIVE_FRAME_H * SHEET_ROWS * scale}px`,
    backgroundPositionX: `${-column * width}px`,
    // Variable que consume el @keyframes `mascot-cycle` (ver tailwind.config.js) — mueve por ALTO de frame, el ancho se fija aparte arriba.
    '--mascot-frame': `${size}px`,
  };

  return (
    <div
      className={`inline-block transition-shadow duration-300 ${haloClassFor(state, level)} ${continuousJitterClass}`}
      style={{ width, height: size }}
    >
      <div className={burstClass} style={{ width, height: size }}>
        <div
          role="img"
          aria-label={`Mascota: ${STATE_LABEL[state]}`}
          className={`pixelated ${ANIMATION_CLASS[state]}`}
          style={style}
        />
      </div>
    </div>
  );
}
