import { useEffect, useRef, useState } from 'react';
import type { VerdictLevel } from '../../lib/types';
import { mascotStateFor, threatTintClassFor } from '../mascot/mascotState';
import { SpiderSilhouette, WebMotif } from './spiderMotifs';

interface ThreatBackdropProps {
  scanStatus: 'idle' | 'loading' | 'success' | 'error';
  level: VerdictLevel | null;
}

/** Debe coincidir con `.fx-burst-malicious` / `.fx-burst-unknown` en styles/index.css — mismas constantes que ya usa `Mascot.tsx` para la misma ráfaga, acá aplicada a la capa de fondo en vez de al sprite. */
const BURST_DURATION_MS: Record<'malicious' | 'unknown', number> = { malicious: 560, unknown: 480 };
const BURST_CLASS: Record<'malicious' | 'unknown', string> = {
  malicious: 'fx-burst-malicious',
  unknown: 'fx-burst-unknown',
};

/**
 * Fondo ambiental decorativo del chat: una araña + telarañas de esquina que
 * rellenan el espacio libre que dejó el sidebar de historial al eliminarse
 * (ver App.tsx, docs/architecture/frontend-design.md §10). Puramente
 * decorativo — `aria-hidden`, `pointer-events: none`, opacidad baja (0.10,
 * dentro del rango 0.08–0.18 pedido) para NUNCA competir con la legibilidad
 * de los mensajes, que siguen viviendo en burbujas opacas por encima de esta
 * capa (ver `MessageBubble.tsx`).
 *
 * Fijo con `-z-10`: un z-index NEGATIVO (no simplemente bajo) es lo que
 * garantiza que quede detrás del contenido del chat sin tener que tocar el
 * stacking del resto de `App.tsx` — un elemento posicionado con z-index
 * negativo pinta ANTES que los descendientes no-posicionados en flujo normal
 * del mismo contexto de apilamiento (el `<div>` de contenido del chat no
 * tiene position/z propio), mientras que `CameraChrome` (fixed, z-40) sigue
 * pintando por encima de todo como ya hacía.
 *
 * Mismo tratamiento de "color de amenaza" que la mascota: reutiliza el
 * MISMO switch nivel→color de `mascotState.ts` (`threatTintClassFor`, hermano
 * de `haloClassFor`, nunca un mapeo paralelo) y el MISMO vocabulario de
 * glitch ya establecido en `styles/index.css` (`fx-burst-malicious` /
 * `fx-burst-unknown` para la ráfaga al revelarse un veredicto,
 * `fx-jitter-confused` / `fx-jitter-scanning` para el temblor continuo) — se
 * reutilizan las clases TAL CUAL, no un sistema de efectos nuevo y paralelo,
 * así el bloque `@media (prefers-reduced-motion: reduce)` que ya las cubre
 * apaga también este efecto sin tener que tocar ese CSS.
 *
 * Misma disciplina de 3 nodos anidados que `Mascot.tsx` (comentario ahí
 * explica el porqué): dos clases con `animation` en el mismo nodo se
 * cancelarían entre sí, así que el jitter continuo (nodo externo) y la
 * ráfaga de un solo ciclo (nodo medio) no pueden compartir elemento.
 */
export function ThreatBackdrop({ scanStatus, level }: ThreatBackdropProps) {
  const state = mascotStateFor(scanStatus, level);
  const tintClass = threatTintClassFor(state, level);

  // Mismo patrón que `Mascot.tsx`: ráfaga de un solo ciclo al REVELARSE un
  // veredicto malicious/unknown (flanco loading -> success), para que una
  // segunda consulta con el mismo resultado también vuelva a glitchear.
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

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${continuousJitterClass}`}
    >
      <div className={`h-full w-full ${burstClass}`}>
        <div className={`h-full w-full opacity-10 transition-colors duration-500 ${tintClass}`}>
          {/* Telarañas en las 4 esquinas — el espacio libre que antes ocupaba
              el sidebar de historial. Centro posicionado fuera del viewport a
              propósito (ver spiderMotifs.tsx) para que sólo se vea el cuarto
              de tela que cae en la esquina real. */}
          <WebMotif className="absolute -left-14 -top-14 h-40 w-40 sm:h-56 sm:w-56" />
          <WebMotif className="absolute -right-14 -top-14 h-40 w-40 sm:h-56 sm:w-56" />
          <WebMotif className="absolute -bottom-16 -left-16 h-48 w-48 sm:h-64 sm:w-64" />
          <WebMotif className="absolute -bottom-16 -right-16 h-48 w-48 sm:h-64 sm:w-64" />

          {/* La araña: grande, detrás de la columna de chat, corrida hacia un
              costado para no quedar pisada por las burbujas centradas. */}
          <SpiderSilhouette className="absolute right-[3%] top-[36%] h-32 w-auto sm:h-48 md:right-[6%] md:h-64" />
        </div>
      </div>
    </div>
  );
}
