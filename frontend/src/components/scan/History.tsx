import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { VerdictBadge } from './VerdictBadge';
import { useHistory } from '../../hooks/useHistory';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Dispara `refresh()` cuando `refreshKey` cambia (un nuevo intercambio de chat resuelto en el padre). */
function useRefreshOnKeyChange(refreshKey: number, refresh: () => void): void {
  const prev = useRef(refreshKey);
  useEffect(() => {
    if (prev.current === refreshKey) return;
    prev.current = refreshKey;
    refresh();
  }, [refreshKey, refresh]);
}

/**
 * Historial como sidebar de alto completo (layout full-bleed — ver
 * App.tsx): a diferencia del panel flotante anterior, este vive fijo a un
 * lado y nunca se mezcla en el flujo de la conversación. Sigue paginado,
 * más reciente primero (orden que ya entrega el backend, ver
 * `historyRepository.list` / domain-model.md §2.5) — el frontend no
 * reordena, sólo pagina sobre `offset`/`limit`.
 */
export function History({ refreshKey }: { refreshKey: number }) {
  const { page, loading, error, offset, pageSize, goToOffset, refresh } = useHistory();
  useRefreshOnKeyChange(refreshKey, refresh);

  const total = page?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <section aria-label="Historial de consultas" className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-pixel-ink2 px-4 py-4">
        <h2 className="font-pixel text-[10px] text-pixel-glass uppercase">Historial</h2>
        <span className="font-mono-pixel text-base text-pixel-fog">{total}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {error ? <p className="font-mono-pixel text-pixel-malicious px-1">{error}</p> : null}
        {loading && !page ? <p className="font-mono-pixel text-pixel-fog px-1">Cargando…</p> : null}
        {!loading && page && page.items.length === 0 ? (
          <p className="font-mono-pixel text-pixel-fog px-1">Todavía no hay consultas.</p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {page?.items.map((scan) => (
            <li key={scan.id} className="flex items-center justify-between gap-2 border-2 border-pixel-ink2 bg-pixel-ink px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono-pixel text-base text-pixel-glass truncate">{scan.ioc.value}</p>
                <p className="font-mono-pixel text-sm text-pixel-fog">
                  {scan.ioc.type} · {formatTimestamp(scan.scannedAt)}
                  {scan.mock ? ' · simulado' : ''}
                </p>
              </div>
              <VerdictBadge level={scan.verdict.level} />
            </li>
          ))}
        </ul>
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between border-t-2 border-pixel-ink2 px-3 py-3">
          <Button variant="secondary" disabled={!hasPrev} onClick={() => goToOffset(offset - pageSize)}>
            ◀
          </Button>
          <span className="font-mono-pixel text-pixel-fog text-sm">
            {Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)}/{total}
          </span>
          <Button variant="secondary" disabled={!hasNext} onClick={() => goToOffset(offset + pageSize)}>
            ▶
          </Button>
        </div>
      ) : null}
    </section>
  );
}
