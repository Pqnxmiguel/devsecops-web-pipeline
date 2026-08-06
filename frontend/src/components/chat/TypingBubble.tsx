import { MascotMessage } from './MascotMessage';

/**
 * Indicador de "está escribiendo…" — reusa el estado `scanning` de la
 * mascota (gafas parpadeando rápido) como pide la consigna, con los tres
 * puntos clásicos de chat animados en CSS puro (mismo criterio que el ciclo
 * del sprite: sin librería).
 */
export function TypingBubble() {
  return (
    <MascotMessage scanStatus="loading" level={null} glitchClassName="fx-burst-message">
      <div className="flex items-center gap-2 py-1" aria-label="El vigilante está revisando las fuentes">
        <span className="font-mono-pixel text-lg text-pixel-fog">Revisando fuentes</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '0ms' }} />
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '180ms' }} />
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '360ms' }} />
        </span>
      </div>
    </MascotMessage>
  );
}
