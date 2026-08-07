import { MascotMessage } from './MascotMessage';

/**
 * Indicador de "está escribiendo…" — reusa el estado `scanning` de la
 * mascota (gafas parpadeando rápido) como pide la consigna, con los tres
 * puntos clásicos de chat animados en CSS puro (mismo criterio que el ciclo
 * del sprite: sin librería). `label` permite reusar la misma mecánica de
 * "pensando → reemplazo por id" para otros fetches en vuelo (p.ej. la
 * consulta de cuota), sin duplicar el componente.
 */
export function TypingBubble({ label = 'Revisando fuentes' }: { label?: string }) {
  return (
    <MascotMessage scanStatus="loading" level={null} glitchClassName="fx-burst-message">
      <div className="flex items-center gap-2 py-1" aria-label={`El vigilante está: ${label.toLowerCase()}`}>
        <span className="font-mono-pixel text-lg text-pixel-fog">{label}</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '0ms' }} />
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '180ms' }} />
          <span className="fx-typing-dot h-2 w-2 bg-pixel-fog" style={{ animationDelay: '360ms' }} />
        </span>
      </div>
    </MascotMessage>
  );
}
