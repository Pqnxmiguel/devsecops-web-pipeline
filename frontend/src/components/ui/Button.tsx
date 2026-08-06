import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-pixel-clean text-pixel-bg border-pixel-ink2 hover:brightness-110',
  secondary: 'bg-pixel-ink text-pixel-glass border-pixel-slate hover:bg-pixel-ink2',
  ghost: 'bg-transparent text-pixel-mist border-pixel-ink2 hover:bg-pixel-ink',
};

/** Botón primitivo en estilo pixel: bordes duros, sin radio, sombra de bloque. */
export function Button({ variant = 'primary', className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'font-pixel text-xs px-4 py-3 border-2 shadow-pixel-sm transition-[filter,transform]',
        'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-pixel-sm',
        VARIANT_CLASSES[variant],
        className,
      ].join(' ')}
    />
  );
}
