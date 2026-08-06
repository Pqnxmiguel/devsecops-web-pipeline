import { MessageBubble } from './MessageBubble';

/** Mensaje del usuario: alineado a la derecha, sin avatar (el usuario no tiene mascota propia en esta conversación). */
export function UserMessage({ text }: { text: string }) {
  return (
    <MessageBubble align="right" className="bg-pixel-ink border-pixel-slate">
      <p className="font-mono-pixel text-lg text-pixel-glass break-all">{text}</p>
    </MessageBubble>
  );
}
