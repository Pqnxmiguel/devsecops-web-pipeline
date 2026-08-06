import type { ElementType, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

/** Contenedor primitivo: fondo de panel, borde duro, sombra de bloque. Polimórfico (`as`) para poder usar `<section>`/`<article>` sin perder el estilo. */
export function Card({ as: Tag = 'div', className = '', ...props }: CardProps) {
  return (
    <Tag
      {...props}
      className={['bg-pixel-bg2 border-2 border-pixel-ink2 shadow-pixel p-4 sm:p-6', className].join(' ')}
    />
  );
}
