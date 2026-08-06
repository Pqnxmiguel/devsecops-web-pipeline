import { useAmbientGlitch } from '../../hooks/useAmbientGlitch';
import { useCorruptedClock } from '../../hooks/useCorruptedClock';

/**
 * El "chrome" de cámara de vigilancia vieja que envuelve TODA la app — es lo
 * que ocupa los bordes que antes quedaban vacíos con el layout de paneles
 * centrados (feedback del usuario, ver frontend-design.md). Puramente
 * decorativo/informativo de ambientación: `aria-hidden`, `pointer-events:
 * none`, fijo sobre el contenido real. Nunca es el único canal de
 * información del veredicto — eso sigue viviendo en `VerdictMessage`
 * (badge + texto + `aria-live`).
 *
 * Piezas:
 *  - Esquinas HUD (corner brackets) — puro chrome estático.
 *  - Indicador REC: punto rojo con pulso LENTO (1.6s, nunca por debajo de
 *    ~0.55 de opacidad) — "parpadeante pero no estroboscópico", como pide
 *    el brief.
 *  - Timestamp en vivo que ocasionalmente corrompe un dígito
 *    (`useCorruptedClock`).
 *  - Viñeta + grano de película + scanlines + roll ocasional + ráfagas
 *    ambientales (`.fx-*`, ver styles/index.css) — todo con amplitud baja y
 *    sostenida, nunca parpadeo de alto contraste (WCAG 2.3.1).
 */
export function CameraChrome() {
  const ambientBurst = useAmbientGlitch();
  const clock = useCorruptedClock();

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
      <div className="fx-vignette absolute inset-0" />
      <div className="fx-grain absolute inset-0" />
      <div className="fx-scan-roll absolute inset-0" />
      <div className="fx-scanlines" />
      <div className={`fx-ambient${ambientBurst ? ' is-active' : ''}`} />

      {/* Esquinas HUD tipo visor de cámara */}
      <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-pixel-slate sm:left-5 sm:top-5" />
      <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-pixel-slate sm:right-5 sm:top-5" />
      <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-pixel-slate sm:bottom-5 sm:left-5" />
      <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-pixel-slate sm:bottom-5 sm:right-5" />

      {/*
        Todo el texto del chrome (REC + "CAM 01" + timestamp) vive agrupado
        en la esquina superior DERECHA, nunca repartido en las 4 esquinas:
        la sidebar de historial ocupa el borde izquierdo completo (header
        "Historial" arriba, panel de debug abajo) y el composer del chat
        ocupa todo el borde inferior de la columna principal — cualquier
        texto de chrome en esas esquinas quedaría atrás/encima de contenido
        real de la UI. Las 4 esquinas siguen llevando el bracket HUD (sólo
        forma, sin texto), que es lo que de verdad lee como "visor de
        cámara" sin competir con nada.
      */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-1 sm:right-6 sm:top-6">
        <div className="flex items-center gap-2">
          <span className="fx-rec-pulse h-2.5 w-2.5 bg-pixel-malicious" />
          <span className="font-pixel text-[9px] text-pixel-malicious">REC</span>
          <span className="font-pixel text-[8px] text-pixel-fog">CAM 01</span>
        </div>
        <div className="font-mono-pixel text-lg text-pixel-mist">
          <ClockDisplay text={clock.text} corruptedIndex={clock.corruptedIndex} />
        </div>
      </div>
    </div>
  );
}

/** Cada carácter es su propio `<span>` para poder resaltar SOLO el dígito corrompido, sin tocar el resto del timestamp real. */
function ClockDisplay({ text, corruptedIndex }: { text: string; corruptedIndex: number | null }) {
  return (
    <span>
      {text.split('').map((ch, i) => (
        // Índice como key: posición fija dentro de un string de longitud constante ("HH:MM:SS").
        <span key={i} className={i === corruptedIndex ? 'text-pixel-glow' : undefined}>
          {ch}
        </span>
      ))}
    </span>
  );
}
