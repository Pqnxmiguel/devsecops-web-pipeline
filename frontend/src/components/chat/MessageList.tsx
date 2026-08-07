import { useEffect, useRef } from 'react';
import type { ChatMessage } from './chatMessages';
import { MascotTextMessage } from './MascotTextMessage';
import { UserMessage } from './UserMessage';
import { TypingBubble } from './TypingBubble';
import { VerdictMessage } from './VerdictMessage';
import { ErrorMessage } from './ErrorMessage';
import { QuotaMessage } from './QuotaMessage';
import { assertUnreachable } from '../../lib/types';

/**
 * `role` decide primero (el discriminante real entre burbuja de usuario y de
 * personaje): `kind: 'text'` existe en AMBOS roles (el saludo/aclaración del
 * personaje y el mensaje tecleado por el usuario comparten esa forma), así
 * que despachar por `kind` sin mirar `role` antes confundiría una burbuja de
 * usuario con una del personaje.
 */
function renderMessage(message: ChatMessage) {
  if (message.role === 'user') return <UserMessage text={message.text} />;

  switch (message.kind) {
    case 'greeting':
    case 'text':
      return <MascotTextMessage text={message.text} />;
    case 'typing':
      return <TypingBubble label={message.label} />;
    case 'verdict':
      return <VerdictMessage scan={message.scan} quota={message.quota} />;
    case 'error':
      return <ErrorMessage message={message.message} />;
    case 'quota':
      return <QuotaMessage quota={message.quota} />;
    default:
      return assertUnreachable(message);
  }
}

/**
 * Lista de mensajes, más reciente al final (orden natural de chat) con
 * autoscroll al fondo en cada mensaje nuevo. El contenedor es el único
 * `aria-live` de la conversación — así un lector de pantalla anuncia cada
 * mensaje nuevo del personaje una sola vez, sin releer toda la conversación.
 */
export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div aria-live="polite" className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      {messages.map((message) => (
        <div key={message.id}>{renderMessage(message)}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
