import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
}

/** Input primitivo en estilo pixel, con slot de mensaje de error en texto (no solo color). */
export function Input({ error, className = '', id, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        className={[
          'w-full bg-pixel-ink text-pixel-glass placeholder:text-pixel-fog',
          'border-2 px-3 py-3 font-mono-pixel text-xl tracking-wide',
          error ? 'border-pixel-malicious' : 'border-pixel-ink2 focus:border-pixel-slate',
          className,
        ].join(' ')}
      />
      {error ? (
        <p id={id ? `${id}-error` : undefined} className="mt-2 text-sm text-pixel-malicious font-mono-pixel">
          {error}
        </p>
      ) : null}
    </div>
  );
}
