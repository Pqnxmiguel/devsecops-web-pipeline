import type { ReactNode } from 'react';

interface MessageBubbleProps {
  align: 'left' | 'right';
  tone?: 'default' | 'error';
  children: ReactNode;
  className?: string;
}

const TONE_BORDER: Record<'default' | 'error', string> = {
  default: 'border-pixel-ink2',
  error: 'border-pixel-malicious',
};

/**
 * Burbuja de chat primitiva. Deliberadamente SIN `border-radius` (regla dura
 * de identidad visual): la "burbuja" es un bloque de esquinas duras con un
 * pixel-shadow, no una forma redondeada — sigue leyéndose como chat por el
 * alineamiento izquierda/derecha y el ancho acotado, no por la forma.
 */
export function MessageBubble({ align, tone = 'default', children, className = '' }: MessageBubbleProps) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[min(34rem,88%)] border-2 bg-pixel-bg2 px-4 py-3 shadow-pixel-sm',
          TONE_BORDER[tone],
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
