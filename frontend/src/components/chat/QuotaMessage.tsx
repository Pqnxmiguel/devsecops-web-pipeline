import { MascotMessage } from './MascotMessage';
import { quotaSourceLine } from '../../lib/quotaPresentation';
import type { QuotaStatus } from '../../lib/types';

/**
 * Mensaje completo de estado de cuota — se dispara cuando el usuario le
 * pregunta al personaje "cuántas consultas me quedan" (ver
 * `lib/quotaQuery.ts` / `hooks/useConversation.ts`). Mismo patrón que
 * `VerdictMessage`/`ErrorMessage`: envuelto en `MascotMessage`, texto plano
 * vía JSX (nunca `dangerouslySetInnerHTML` — a diferencia de la VULN-07).
 */
export function QuotaMessage({ quota }: { quota: QuotaStatus }) {
  return (
    <MascotMessage scanStatus="success" level={null} glitchClassName="fx-burst-message">
      <div className="flex flex-col gap-2" aria-live="polite">
        {quota.mockMode ? (
          <p className="font-pixel text-[9px] text-pixel-unknown uppercase">
            Modo simulado activo: esto no consume cuota real.
          </p>
        ) : null}

        <p className="font-mono-pixel text-lg text-pixel-mist">Así está la cuota de las fuentes hoy:</p>

        <ul className="flex flex-col gap-1">
          {quota.sources.map((source) => (
            <li key={source.source} className="font-mono-pixel text-base text-pixel-glass">
              {quotaSourceLine(source)}
            </li>
          ))}
        </ul>
      </div>
    </MascotMessage>
  );
}
