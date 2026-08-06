import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const DIGIT_GLYPHS = '0123456789';
// Ventana en la que un dígito puede aparecer "corrompido" antes de
// corregirse solo — deliberadamente breve (un solo tick de reloj, <= 1s) y
// de baja frecuencia (una vez cada 6-11s), coherente con el resto de la capa
// CCTV: "textura y desestabilización de baja amplitud sostenida", nunca un
// parpadeo. Un único carácter cambia, el resto del timestamp real es
// siempre correcto.
const MIN_GAP_MS = 6000;
const MAX_GAP_MS = 11000;

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

interface CorruptedClockResult {
  /** Timestamp real, siempre correcto — mostrado salvo el instante puntual de corrupción. */
  text: string;
  /** Índice del carácter corrompido en `text`, o `null` si no hay corrupción activa. */
  corruptedIndex: number | null;
}

/**
 * Reloj CCTV en vivo (tick real, cada segundo) que ocasionalmente muestra un
 * dígito equivocado por un instante y se autocorrige — el "timestamp que
 * ocasionalmente se corrompe un dígito" del brief. Bajo
 * `prefers-reduced-motion: reduce` el reloj sigue funcionando (mostrar la
 * hora no es un efecto de movimiento) pero la corrupción se desactiva por
 * completo: nunca se programa el temporizador que la dispara.
 */
export function useCorruptedClock(): CorruptedClockResult {
  const [now, setNow] = useState(() => new Date());
  const [corruptedIndex, setCorruptedIndex] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setCorruptedIndex(null);
      return undefined;
    }

    let flickerTimeout: ReturnType<typeof setTimeout>;
    let scheduleTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function scheduleNext() {
      const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
      scheduleTimeout = setTimeout(() => {
        if (cancelled) return;
        // Índices 0,1,3,4,6,7 son dígitos en "HH:MM:SS" (2 y 5 son ':').
        const digitIndices = [0, 1, 3, 4, 6, 7] as const;
        const index = digitIndices[Math.floor(Math.random() * digitIndices.length)] ?? 0;
        setCorruptedIndex(index);
        flickerTimeout = setTimeout(() => {
          if (cancelled) return;
          setCorruptedIndex(null);
          scheduleNext();
        }, 400);
      }, gap);
    }

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(scheduleTimeout);
      clearTimeout(flickerTimeout);
    };
  }, [reducedMotion]);

  const text = formatClock(now);
  if (corruptedIndex === null) return { text, corruptedIndex: null };

  // El dígito "corrompido" se sustituye por un glifo aleatorio SOLO para el
  // instante de la ráfaga — nunca se guarda ni se usa como la hora real.
  const glyph = DIGIT_GLYPHS[Math.floor(Math.random() * DIGIT_GLYPHS.length)];
  const displayed = text.slice(0, corruptedIndex) + glyph + text.slice(corruptedIndex + 1);
  return { text: displayed, corruptedIndex };
}
