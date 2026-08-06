import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useScan } from './useScan';
import { detectIocType } from '../lib/iocDetect';
import {
  conversationReducer,
  initialMessages,
  nextMessageId,
  type ChatMessage,
} from '../components/chat/chatMessages';

interface UseConversationOptions {
  /** Se llama cuando un intercambio termina (éxito o error) — el llamador decide si eso amerita refrescar el historial. */
  onExchangeSettled?: () => void;
}

interface UseConversationResult {
  messages: ChatMessage[];
  submit: (rawValue: string) => void;
  /** `true` mientras hay un scan en vuelo — el composer se deshabilita para no permitir burbujas de "pensando" superpuestas. */
  busy: boolean;
}

/**
 * Orquesta la conversación: detecta el tipo de IOC (o pide aclarar si no lo
 * reconoce), dispara `useScan` (sin tocar su lógica interna — ver
 * `lib/api.ts`/`hooks/useScan.ts`, preservados), y traduce sus transiciones
 * de estado a mensajes de chat vía `conversationReducer`. La máquina de
 * mensajes en sí es pura y vive en `chatMessages.ts` (testeable sin montar
 * este hook).
 */
export function useConversation({ onExchangeSettled }: UseConversationOptions = {}): UseConversationResult {
  const [messages, dispatch] = useReducer(conversationReducer, undefined, initialMessages);
  const { status, scan, error, run } = useScan();
  // El id del mensaje "typing" en vuelo, para poder reemplazarlo cuando el
  // scan resuelve. Un ref porque no dispara render por sí solo — sólo lo lee
  // el efecto de abajo.
  const pendingMessageId = useRef<string | null>(null);
  const settledRef = useRef(onExchangeSettled);
  settledRef.current = onExchangeSettled;

  const submit = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (trimmed === '' || status === 'loading') return;

      const userMessageId = nextMessageId('user');
      const type = detectIocType(trimmed);

      if (!type) {
        dispatch({ type: 'unrecognized', userMessageId, clarifyMessageId: nextMessageId('clarify'), text: trimmed });
        return;
      }

      const typingMessageId = nextMessageId('typing');
      pendingMessageId.current = typingMessageId;
      dispatch({ type: 'submitted', userMessageId, typingMessageId, text: trimmed });
      run(type, trimmed);
    },
    [run, status],
  );

  useEffect(() => {
    const messageId = pendingMessageId.current;
    if (!messageId) return;

    if (status === 'success' && scan) {
      pendingMessageId.current = null;
      dispatch({ type: 'scan-succeeded', messageId, scan });
      settledRef.current?.();
    } else if (status === 'error') {
      pendingMessageId.current = null;
      dispatch({ type: 'scan-failed', messageId, message: error ?? 'No se pudo contactar al servidor.' });
      settledRef.current?.();
    }
  }, [status, scan, error]);

  return { messages, submit, busy: status === 'loading' };
}
