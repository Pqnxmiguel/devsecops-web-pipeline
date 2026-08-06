import { useCallback, useEffect, useState } from 'react';
import { getHistory } from '../lib/api';
import type { HistoryPage } from '../lib/types';

const PAGE_SIZE = 10;

interface UseHistoryResult {
  page: HistoryPage | null;
  loading: boolean;
  error: string | null;
  offset: number;
  pageSize: number;
  goToOffset: (offset: number) => void;
  refresh: () => void;
}

/**
 * `refreshToken` en vez de exponer `setPage` directamente: `refresh()` es la
 * única forma de forzar un refetch desde fuera, así el hook mantiene el
 * control de cuándo pide datos (evita que un consumidor mute el estado a
 * mano y lo desincronice del backend).
 */
export function useHistory(): UseHistoryResult {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHistory({ limit: PAGE_SIZE, offset })
      .then((result) => {
        if (cancelled) return;
        setPage(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No se pudo cargar el historial.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset, refreshToken]);

  const goToOffset = useCallback((next: number) => {
    setOffset(Math.max(0, next));
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { page, loading, error, offset, pageSize: PAGE_SIZE, goToOffset, refresh };
}
