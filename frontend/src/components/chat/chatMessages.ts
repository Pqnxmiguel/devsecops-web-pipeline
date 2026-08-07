/**
 * Modelo y reducer de la conversación. Separado de `useConversation.ts` (el
 * hook) para que la máquina de estados sea una función pura testable sin
 * montar React (ver `chatMessages.test.ts`) — mismo criterio que
 * `mascotState.ts`: la lógica de transición vive fuera del componente.
 */
import type { QuotaStatus, Scan } from '../../lib/types';

export type ChatMessage =
  | { id: string; role: 'mascot'; kind: 'greeting'; text: string }
  | { id: string; role: 'mascot'; kind: 'text'; text: string }
  /** `label` distingue "Revisando fuentes" (scan) de "Consultando cuota" — mismo indicador visual, texto según lo que está en vuelo. */
  | { id: string; role: 'mascot'; kind: 'typing'; label?: string }
  /** `quota` es opcional y se completa DESPUÉS de que el veredicto ya se resolvió (ver acción `quota-attached`) — sólo para scans no-mock. */
  | { id: string; role: 'mascot'; kind: 'verdict'; scan: Scan; quota?: QuotaStatus }
  | { id: string; role: 'mascot'; kind: 'error'; message: string }
  | { id: string; role: 'mascot'; kind: 'quota'; quota: QuotaStatus }
  | { id: string; role: 'user'; kind: 'text'; text: string };

export type ChatAction =
  /** El usuario mandó un valor reconocible como IOC: se agrega su burbuja + el indicador de "pensando" del personaje. */
  | { type: 'submitted'; userMessageId: string; typingMessageId: string; text: string }
  /** El usuario mandó algo que `detectIocType` no reconoce: no hay fetch, el personaje solo pide aclarar. */
  | { type: 'unrecognized'; userMessageId: string; clarifyMessageId: string; text: string }
  | { type: 'scan-succeeded'; messageId: string; scan: Scan }
  | { type: 'scan-failed'; messageId: string; message: string }
  /** `isQuotaQuery` matcheó: burbuja de usuario + "pensando" propio, sin pasar por `detectIocType` ni por `useScan`. */
  | { type: 'quota-requested'; userMessageId: string; typingMessageId: string; text: string }
  | { type: 'quota-resolved'; messageId: string; quota: QuotaStatus }
  | { type: 'quota-failed'; messageId: string; message: string }
  /** Se dispara después de un `scan-succeeded` no-mock: adjunta la cuota al mensaje de veredicto YA resuelto, sin tocar su contenido. Si el mensaje ya no es `verdict` (no debería pasar) o no existe, no-op. */
  | { type: 'quota-attached'; messageId: string; quota: QuotaStatus };

let counter = 0;
/** IDs incrementales + timestamp: suficiente para una lista in-memory de una sola pestaña, sin dependencia de `crypto.randomUUID` (no disponible en todos los entornos de test). */
export function nextMessageId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

const GREETING =
  'Hola. Soy el vigilante de este sistema. Pasame una IP, un hash (MD5/SHA1/SHA256) o un dominio y lo reviso contra las fuentes.';

const CLARIFY_PREFIX = 'No reconozco "';
const CLARIFY_SUFFIX = '" como IP, hash o dominio. ¿Podés revisarlo y volver a intentar?';

export function initialMessages(): ChatMessage[] {
  return [{ id: nextMessageId('greeting'), role: 'mascot', kind: 'greeting', text: GREETING }];
}

export function clarifyText(rawValue: string): string {
  return `${CLARIFY_PREFIX}${rawValue}${CLARIFY_SUFFIX}`;
}

export function conversationReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case 'submitted':
      return [
        ...state,
        { id: action.userMessageId, role: 'user', kind: 'text', text: action.text },
        { id: action.typingMessageId, role: 'mascot', kind: 'typing' },
      ];

    case 'unrecognized':
      return [
        ...state,
        { id: action.userMessageId, role: 'user', kind: 'text', text: action.text },
        { id: action.clarifyMessageId, role: 'mascot', kind: 'text', text: clarifyText(action.text) },
      ];

    case 'scan-succeeded':
      return replaceMessage(state, action.messageId, {
        id: action.messageId,
        role: 'mascot',
        kind: 'verdict',
        scan: action.scan,
      });

    case 'scan-failed':
      return replaceMessage(state, action.messageId, {
        id: action.messageId,
        role: 'mascot',
        kind: 'error',
        message: action.message,
      });

    case 'quota-requested':
      return [
        ...state,
        { id: action.userMessageId, role: 'user', kind: 'text', text: action.text },
        { id: action.typingMessageId, role: 'mascot', kind: 'typing', label: 'Consultando cuota' },
      ];

    case 'quota-resolved':
      return replaceMessage(state, action.messageId, {
        id: action.messageId,
        role: 'mascot',
        kind: 'quota',
        quota: action.quota,
      });

    case 'quota-failed':
      return replaceMessage(state, action.messageId, {
        id: action.messageId,
        role: 'mascot',
        kind: 'error',
        message: action.message,
      });

    case 'quota-attached': {
      const index = state.findIndex((m) => m.id === action.messageId);
      if (index === -1) return state;
      const message = state[index];
      if (!message || message.kind !== 'verdict') return state;
      const copy = state.slice();
      copy[index] = { ...message, quota: action.quota };
      return copy;
    }

    default:
      return state;
  }
}

function replaceMessage(state: ChatMessage[], id: string, next: ChatMessage): ChatMessage[] {
  const index = state.findIndex((m) => m.id === id);
  if (index === -1) return [...state, next];
  const copy = state.slice();
  copy[index] = next;
  return copy;
}
