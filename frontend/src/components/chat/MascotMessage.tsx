import type { ReactNode } from 'react';
import { Mascot } from '../mascot/Mascot';
import type { VerdictLevel } from '../../lib/types';
import { MessageBubble } from './MessageBubble';

interface MascotMessageProps {
  /** Estado del ciclo de vida QUE ESTE MENSAJE representa (no el estado global de la app) — así el avatar de una burbuja de veredicto vieja se queda reaccionando a SU resultado, no al último scan. */
  scanStatus: 'idle' | 'loading' | 'success' | 'error';
  level: VerdictLevel | null;
  tone?: 'default' | 'error';
  children: ReactNode;
  /** Ráfaga de glitch de un solo ciclo al montar el mensaje — ver styles/index.css `.fx-burst-message`. Cada mensaje nuevo del personaje dispara una, más los bursts temáticos de `malicious`/`unknown` que ya existían. */
  glitchClassName?: string;
}

/**
 * Mensaje del personaje: avatar (mascota a tamaño de ícono de chat) + burbuja
 * alineada a la izquierda. El avatar reutiliza el componente `Mascot` tal
 * cual —scanStatus/level, cero props nuevas— así que la animación del sprite
 * sigue siendo 100% CSS `steps()` también aquí.
 */
export function MascotMessage({ scanStatus, level, tone = 'default', children, glitchClassName = '' }: MascotMessageProps) {
  return (
    <div className="flex items-end gap-3">
      <div className="shrink-0 pb-1">
        <Mascot scanStatus={scanStatus} level={level} size={40} />
      </div>
      <MessageBubble align="left" tone={tone} className={glitchClassName}>
        {children}
      </MessageBubble>
    </div>
  );
}
