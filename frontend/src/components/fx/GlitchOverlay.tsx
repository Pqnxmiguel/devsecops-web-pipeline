import { useAmbientGlitch } from '../../hooks/useAmbientGlitch';

/**
 * Capa de "inestabilidad ambiental": vive una sola vez en la raíz de la app
 * (ver App.tsx), fija sobre todo el contenido. Puramente decorativa —
 * `aria-hidden` y `pointer-events: none` — nunca contiene información propia,
 * así que no compite con el veredicto ni con un lector de pantalla.
 *
 * El disparo (cuándo aparece la ráfaga) lo decide `useAmbientGlitch` en JS,
 * con timing aleatorio; el efecto en sí (`.fx-ambient`, `.fx-scanlines`) es
 * 100% CSS — cero dependencias, mismo criterio que el ciclo del sprite de la
 * mascota. Ver docs/architecture/frontend-design.md §8.
 */
export function GlitchOverlay() {
  const active = useAmbientGlitch();

  return (
    <>
      <div className="fx-scanlines" aria-hidden="true" />
      <div className={`fx-ambient${active ? ' is-active' : ''}`} aria-hidden="true" />
    </>
  );
}
