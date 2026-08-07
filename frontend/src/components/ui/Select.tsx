import type { SelectHTMLAttributes } from 'react';

/** Select primitivo en estilo pixel — usado para el selector explícito de tipo de IOC. */
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'bg-pixel-ink text-pixel-glass border-2 border-pixel-ink2 focus:border-pixel-slate',
        'px-3 py-3 font-pixel text-xs',
        className,
      ].join(' ')}
    />
  );
}
