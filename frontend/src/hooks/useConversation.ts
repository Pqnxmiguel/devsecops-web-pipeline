import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useScan } from './useScan';
import { detectIocType } from '../lib/iocDetect';
import { isQuotaQuery } from '../lib/quotaQuery';
import { getQuota } from '../lib/api';
import { ApiError } from '../lib/types';
import {
  conversationReducer,
  initialMessages,
  nextMessageId,
  type ChatMessage,
} from '../components/chat/chatMessages';

interface UseConversationResult {
  messages: ChatMessage[];
  submit: (rawValue: string) => void;
  /** `true` mientras hay un scan o una consulta de cuota en vuelo — el composer se deshabilita para no permitir burbujas de "pensando" superpuestas. */
  busy: boolean;
}

/**
 * Orquesta la conversación: detecta el tipo de IOC (o pide aclarar si no lo
 * reconoce), dispara `useScan` (sin tocar su lógica interna — ver
 * `lib/api.ts`/`hooks/useScan.ts`, preservados), y traduce sus transiciones
 * de estado a mensajes de chat vía `conversationReducer`. La máquina de
 * mensajes en sí es pura y vive en `chatMessages.ts` (testeable sin montar
 * este hook).
 *
 * Además de IOCs, intercepta preguntas por la cuota diaria de las fuentes
 * externas (`isQuotaQuery`, ver `lib/quotaQuery.ts`) ANTES de llegar a
 * `detectIocType` — ese flujo nunca toca `useScan` porque no es un scan, es
 * una consulta directa a `GET /api/quota` con su propio ciclo
 * "pensando → reemplazo por id" (misma mecánica que `submitted`/
 * `scan-succeeded`, no una reimplementación paralela).
 *
 * Ya no acepta un callback `onExchangeSettled`: existía sólo para refrescar
 * el sidebar de historial, eliminado del frontend (el chat es la única
 * "memoria" visible — ver docs/architecture/frontend-design.md §10). El
 * endpoint `GET /api/history` del backend sigue vivo, simplemente no se
 * consume desde acá.
 */
export function useConversation(): UseConversationResult {
  const [messages, dispatch] = useReducer(conversationReducer, undefined, initialMessages);
  const { status, scan, error, run } = useScan();
  // El id del mensaje "typing" en vuelo para un SCAN, para poder
  // reemplazarlo cuando `useScan` resuelve. Un ref porque no dispara render
  // por sí solo — sólo lo lee el efecto de abajo.
  const pendingMessageId = useRef<string | null>(null);
  // Consulta de cuota (pregunta directa al personaje): fetch propio, fuera
  // de `useScan`, así que necesita su propio flag de "en vuelo" para el
  // `busy` combinado que deshabilita el composer.
  const [quotaQueryBusy, setQuotaQueryBusy] = useState(false);

  const submitQuotaQuery = useCallback((trimmed: string) => {
    const userMessageId = nextMessageId('user');
    const typingMessageId = nextMessageId('typing');
    setQuotaQueryBusy(true);
    dispatch({ type: 'quota-requested', userMessageId, typingMessageId, text: trimmed });

    getQuota()
      .then((quota) => {
        dispatch({ type: 'quota-resolved', messageId: typingMessageId, quota });
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : 'No pude consultar la cuota ahora mismo.';
        dispatch({ type: 'quota-failed', messageId: typingMessageId, message });
      })
      .finally(() => {
        setQuotaQueryBusy(false);
      });
  }, []);

  const submit = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (trimmed === '' || status === 'loading' || quotaQueryBusy) return;

      if (isQuotaQuery(trimmed)) {
        submitQuotaQuery(trimmed);
        return;
      }

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
    [run, status, quotaQueryBusy, submitQuotaQuery],
  );

  useEffect(() => {
    const messageId = pendingMessageId.current;
    if (!messageId) return;

    if (status === 'success' && scan) {
      pendingMessageId.current = null;
      dispatch({ type: 'scan-succeeded', messageId, scan });

      // El footer de cuota en el veredicto sólo tiene sentido para un scan
      // real (ver VerdictMessage.tsx). Se pide DESPUÉS de resolver el
      // veredicto y se adjunta aparte (`quota-attached`) para no bloquear ni
      // hacer fallar el mensaje si /api/quota falla un instante después.
      if (scan.mock === false) {
        getQuota()
          .then((quota) => dispatch({ type: 'quota-attached', messageId, quota }))
          .catch(() => {
            /* el veredicto ya se resolvió bien; sin footer este turno. */
          });
      }
    } else if (status === 'error') {
      pendingMessageId.current = null;
      dispatch({ type: 'scan-failed', messageId, message: error ?? 'No se pudo contactar al servidor.' });
    }
  }, [status, scan, error]);

  return { messages, submit, busy: status === 'loading' || quotaQueryBusy };
}
