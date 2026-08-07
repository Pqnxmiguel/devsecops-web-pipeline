import { useCallback, useRef, useState } from 'react';
import { scanIoc } from '../lib/api';
import { ApiError, type IocType, type Scan } from '../lib/types';

export type ScanStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseScanResult {
  status: ScanStatus;
  scan: Scan | null;
  error: string | null;
  run: (type: IocType, value: string) => Promise<void>;
  reset: () => void;
}

/**
 * Orquesta una consulta de scan. No hace debounce ni cachea — es una acción
 * explícita disparada por el usuario (submit del formulario), no un fetch
 * derivado de un cambio de input; no hay waterfall que evitar aquí.
 */
export function useScan(): UseScanResult {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Evita que una respuesta tardía de una consulta anterior pise el
  // resultado de una más reciente si el usuario dispara varias seguidas.
  const requestId = useRef(0);

  const run = useCallback(async (type: IocType, value: string) => {
    const id = (requestId.current += 1);
    setStatus('loading');
    setError(null);
    try {
      const result = await scanIoc(type, value);
      if (requestId.current !== id) return;
      setScan(result);
      setStatus('success');
    } catch (err) {
      if (requestId.current !== id) return;
      const message = err instanceof ApiError ? err.message : 'No se pudo contactar al servidor.';
      setError(message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setStatus('idle');
    setScan(null);
    setError(null);
  }, []);

  return { status, scan, error, run, reset };
}
