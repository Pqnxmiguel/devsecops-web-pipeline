import { useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
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

/** Dispara `refresh()` cuando `refreshKey` cambia (un nuevo scan exitoso en el padre). */
function useRefreshOnKeyChange(refreshKey: number, refresh: () => void): void {
  const prev = useRef(refreshKey);
  useEffect(() => {
    if (prev.current === refreshKey) return;
    prev.current = refreshKey;
    refresh();
  }, [refreshKey, refresh]);
}

/**
 * Historial paginado, más reciente primero (el backend ya lo entrega en ese
 * orden — `historyRepository.list`, ver domain-model.md §2.5). El frontend
 * no reordena; sólo pagina sobre `offset`/`limit`.
 */
export function History({ refreshKey }: { refreshKey: number }) {
  const { page, loading, error, offset, pageSize, goToOffset, refresh } = useHistory();
  useRefreshOnKeyChange(refreshKey, refresh);

  const total = page?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <Card as="section" aria-label="Historial de consultas">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-pixel text-xs text-pixel-glass">Historial</h2>
        <span className="font-mono-pixel text-base text-pixel-fog">{total} scan(s)</span>
      </div>

      {error ? <p className="font-mono-pixel text-pixel-malicious">{error}</p> : null}
      {loading && !page ? <p className="font-mono-pixel text-pixel-fog">Cargando…</p> : null}
      {!loading && page && page.items.length === 0 ? (
        <p className="font-mono-pixel text-pixel-fog">Todavía no hay consultas.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {page?.items.map((scan) => (
          <li
            key={scan.id}
            className="flex items-center justify-between gap-3 border-2 border-pixel-ink2 bg-pixel-ink px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-mono-pixel text-lg text-pixel-glass truncate">{scan.ioc.value}</p>
              <p className="font-mono-pixel text-sm text-pixel-fog">
                {scan.ioc.type} · {formatTimestamp(scan.scannedAt)}
                {scan.mock ? ' · simulado' : ''}
              </p>
            </div>
            <VerdictBadge level={scan.verdict.level} />
          </li>
        ))}
      </ul>

      {total > pageSize ? (
        <div className="flex items-center justify-between mt-4">
          <Button variant="secondary" disabled={!hasPrev} onClick={() => goToOffset(offset - pageSize)}>
            ◀ Anterior
          </Button>
          <span className="font-mono-pixel text-pixel-fog text-sm">
            {Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)} de {total}
          </span>
          <Button variant="secondary" disabled={!hasNext} onClick={() => goToOffset(offset + pageSize)}>
            Siguiente ▶
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
