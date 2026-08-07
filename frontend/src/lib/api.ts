/**
 * Cliente de API. Único punto del frontend que sabe que existe un backend en
 * `/api`. Todo pasa por rutas relativas — el navegador nunca llama a
 * AbuseIPDB, VirusTotal ni URLhaus directamente, y ninguna API key vive en
 * este bundle. Ver docs/architecture/frontend-design.md §7.
 */
import type { ApiErrorBody, HealthStatus, HistoryPage, IocType, QuotaStatus, Scan } from './types';
import { ApiError } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = { error: { code: 'UNKNOWN', message: `Error HTTP ${res.status}` } };
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('/api/health');
}

/** GET /api/quota — cuánto queda de la cuota diaria gratuita de cada fuente externa. */
export function getQuota(): Promise<QuotaStatus> {
  return request<QuotaStatus>('/api/quota');
}

/** POST /api/scan/{type} — el backend valida y normaliza; el cliente sólo envía el valor crudo. */
export function scanIoc(type: IocType, value: string): Promise<Scan> {
  return request<Scan>(`/api/scan/${type}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
}

export function getHistory(params: { limit?: number; offset?: number } = {}): Promise<HistoryPage> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return request<HistoryPage>(`/api/history${qs ? `?${qs}` : ''}`);
}
