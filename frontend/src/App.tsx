import { useMemo, useState } from 'react';
import { Mascot } from './components/mascot/Mascot';
import { STATE_LABEL, mascotStateFor } from './components/mascot/mascotState';
import { History } from './components/scan/History';
import { MessageList } from './components/chat/MessageList';
import { ChatComposer } from './components/chat/ChatComposer';
import { CameraChrome } from './components/fx/CameraChrome';
import { useConversation } from './hooks/useConversation';

/**
 * Layout full-bleed: sidebar de historial de alto completo + columna de
 * chat que ocupa el resto del ancho, con el chrome de cámara de vigilancia
 * (`CameraChrome`) fijo por encima de todo. Reemplaza el layout anterior de
 * paneles centrados con una columna angosta — feedback directo del usuario
 * ("2 cuadros en la mitad y a los lados nada"), ver
 * docs/architecture/frontend-design.md.
 */
export function App() {
  const [historyKey, setHistoryKey] = useState(0);
  const { messages, submit, busy } = useConversation({
    onExchangeSettled: () => setHistoryKey((k) => k + 1),
  });

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
    <div className="h-screen w-screen overflow-hidden bg-pixel-bg">
      <CameraChrome />

      <div className="fx-feed-jitter grid h-full grid-cols-1 sm:grid-cols-[16rem_1fr]">
        <aside className="hidden h-full min-h-0 flex-col border-r-2 border-pixel-ink2 bg-pixel-bg2 sm:flex">
          <History refreshKey={historyKey} />
        </aside>

        <div className="flex h-full min-h-0 flex-col">
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
    </div>
  );
}
