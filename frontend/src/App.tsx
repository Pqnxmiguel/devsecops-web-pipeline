import { useMemo } from 'react';
import { Mascot } from './components/mascot/Mascot';
import { STATE_LABEL, mascotStateFor } from './components/mascot/mascotState';
import { MessageList } from './components/chat/MessageList';
import { ChatComposer } from './components/chat/ChatComposer';
import { CameraChrome } from './components/fx/CameraChrome';
import { ThreatBackdrop } from './components/fx/ThreatBackdrop';
import { useConversation } from './hooks/useConversation';

/**
 * Layout full-bleed: sólo la columna de chat, a ancho completo. El sidebar
 * de historial se eliminó por completo — "no tiene sentido el historial si
 * es un chat" (feedback textual del usuario, ver
 * docs/architecture/frontend-design.md §10) — la conversación en curso
 * (`useConversation`) es la única "memoria" visible; `GET /api/history`
 * sigue vivo en el backend, simplemente ya no se consume desde acá.
 *
 * El chrome de cámara de vigilancia (`CameraChrome`) sigue fijo por encima
 * de todo, y un fondo ambiental decorativo (`ThreatBackdrop`: araña +
 * telarañas, teñido según el veredicto) va fijo por debajo, rellenando el
 * espacio libre que dejó el sidebar.
 */
export function App() {
  const { messages, submit, busy } = useConversation();

  const headerLevel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.role === 'mascot' && message.kind === 'verdict') return message.scan.verdict.level;
    }
    return null;
  }, [messages]);
  const headerScanStatus: 'idle' | 'loading' | 'success' | 'error' = busy
    ? 'loading'
    : headerLevel
      ? 'success'
      : 'idle';
  const headerMascotState = mascotStateFor(headerScanStatus, headerLevel);

  return (
    // Sin `bg-pixel-bg` propio a propósito: ese color ya lo pinta `body` (ver
    // styles/index.css), que es el verdadero fondo del contexto de
    // apilamiento raíz. Si este `<div>` tuviera su propio fondo opaco,
    // pintaría (por ser no-posicionado) POR ENCIMA del `ThreatBackdrop`
    // (`position: fixed` con z-index NEGATIVO) y lo taparía por completo —
    // mismo color visual, cero diferencia salvo que el fondo ambiental se
    // vuelve visible donde corresponde.
    <div className="h-screen w-screen overflow-hidden">
      <ThreatBackdrop scanStatus={headerScanStatus} level={headerLevel} />
      <CameraChrome />

      <div className="fx-feed-jitter flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b-2 border-pixel-ink2 px-4 py-3 sm:px-6">
          <Mascot scanStatus={headerScanStatus} level={headerLevel} size={40} />
          <div className="min-w-0">
            <h1 className="font-pixel text-[10px] text-pixel-glass leading-relaxed sm:text-xs">IOC SCANNER</h1>
            <p className="font-mono-pixel text-base text-pixel-fog truncate">{STATE_LABEL[headerMascotState]}</p>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <MessageList messages={messages} />
        </div>

        <ChatComposer onSubmit={submit} busy={busy} />
      </div>
    </div>
  );
}
