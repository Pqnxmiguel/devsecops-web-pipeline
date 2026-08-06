import { useEffect, useState } from 'react';

function readPreference(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Única fuente de verdad para `prefers-reduced-motion` en JS — antes cada
 * hook de efectos (`useAmbientGlitch`) leía `matchMedia` por su cuenta; con
 * la capa CCTV corriendo "todo el tiempo" (reloj, glitches ambientales,
 * jitter de cámara) conviene un solo lugar que se re-evalúe en vivo si el
 * usuario cambia la preferencia del SO sin recargar la pestaña.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
