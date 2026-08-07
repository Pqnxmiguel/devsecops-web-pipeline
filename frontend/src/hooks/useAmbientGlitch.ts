import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

// Intervalo aleatorio entre ráfagas: el jitter en el intervalo (no un
// `setInterval` fijo) es justo lo que hace que se sienta "roto" de verdad en
// vez de un parpadeo perfectamente periódico — que además sería el patrón
// que WCAG 2.3.1 penaliza. Ver docs/architecture/frontend-design.md §8.
const MIN_INTERVAL_MS = 7000;
const MAX_INTERVAL_MS = 13000;
// Duración de la ráfaga en sí (debe coincidir con `.fx-ambient.is-active` en
// styles/index.css): breve a propósito, muy por debajo de cualquier lectura
// como "parpadeo sostenido".
const BURST_DURATION_MS = 240;

/**
 * Orquesta EL CUÁNDO del glitch ambiental (timing aleatorio, mínimo de JS
 * necesario); el efecto visual en sí es 100% CSS (`.fx-ambient` /
 * `.fx-scanlines`). Devuelve `true` durante la breve ventana de la ráfaga.
 *
 * Se apaga por completo si `prefers-reduced-motion: reduce` está activo — se
 * comprueba al montar y se re-evalúa si el usuario cambia la preferencia del
 * sistema operativo mientras la pestaña sigue abierta (no hace falta recargar
 * para que la app deje de glitchear).
 */
export function useAmbientGlitch(): boolean {
  const [active, setActive] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setActive(false);
      return;
    }

    let burstTimeout: ReturnType<typeof setTimeout>;
    let scheduleTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function scheduleNext() {
      const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      scheduleTimeout = setTimeout(() => {
        if (cancelled) return;
        setActive(true);
        burstTimeout = setTimeout(() => {
          if (cancelled) return;
          setActive(false);
          scheduleNext();
        }, BURST_DURATION_MS);
      }, delay);
    }

    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(scheduleTimeout);
      clearTimeout(burstTimeout);
    };
  }, [reducedMotion]);

  return active;
}
