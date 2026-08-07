import { useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ChatComposerProps {
  onSubmit: (value: string) => void;
  busy: boolean;
}

/**
 * Barra de entrada del chat: un único campo de texto (la detección de tipo
 * de IOC pasa a ser parte de la conversación — ver `useConversation` — en
 * vez de un selector manual al lado del input, como tenía el formulario
 * anterior). Deshabilitada mientras `busy` para no permitir superponer una
 * segunda pregunta sobre la burbuja de "pensando" en curso.
 */
export function ChatComposer({ onSubmit, busy }: ChatComposerProps) {
  const [value, setValue] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '' || busy) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 border-t-2 border-pixel-ink2 bg-pixel-bg px-4 py-4 sm:px-6">
      <div className="flex-1">
        <label htmlFor="chat-composer-input" className="sr-only">
          IP, hash o dominio a consultar
        </label>
        <Input
          id="chat-composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="192.0.2.1, ejemplo.com, 44d8861..."
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>
      <Button type="submit" disabled={busy || value.trim() === ''}>
        {busy ? 'Revisando…' : 'Enviar'}
      </Button>
    </form>
  );
}
