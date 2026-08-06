/**
 * Tipos del dominio, espejo exacto del contrato descrito en
 * docs/architecture/domain-model.md. No se inventan formas propias: si el
 * backend cambia esta forma, es un cambio de contrato deliberado, no un
 * detalle de implementación del frontend.
 *
 * La pieza más importante de este archivo es que `score` es `number | null`
 * y que `level` tiene 4 miembros. Modelarlo así es lo que hace que
 * `score ?? 0` o un `switch` sin rama `unknown` fallen en compilación.
 */

export type IocType = 'ip' | 'hash' | 'domain';

export type Ioc =
  | { type: 'ip'; value: string; ipVersion: 4 | 6 }
  | { type: 'hash'; value: string; algorithm: 'md5' | 'sha1' | 'sha256' }
  | { type: 'domain'; value: string };

/** Los 4 niveles del dominio. `unknown` NO es un punto de la escala clean<suspicious<malicious. */
export type VerdictLevel = 'clean' | 'suspicious' | 'malicious' | 'unknown';

export type SourceId = 'abuseipdb' | 'virustotal' | 'urlhaus';

export type DegradedReason = 'timeout' | 'rate_limit' | 'unavailable' | 'bad_response';

export interface SourceReport {
  source: SourceId | string;
  level: VerdictLevel;
  /** null si y sólo si level === 'unknown' (fuente degradada). */
  score: number | null;
  confidence: number;
  details: Record<string, unknown> & { reason?: DegradedReason };
  degraded: boolean;
  queriedAt?: string;
}

export interface Verdict {
  level: VerdictLevel;
  /** null si y sólo si level === 'unknown'. Nunca leer como 0. */
  score: number | null;
  confidence: number;
  summary: string;
}

export interface Scan {
  id: string;
  ioc: Ioc;
  verdict: Verdict;
  sources: SourceReport[];
  scannedAt: string;
  mock: boolean;
}

export interface HistoryPage {
  items: Scan[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthStatus {
  status: string;
  uptime: number;
  version: string;
  mockMode: boolean;
  sources: string[];
  timestamp: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    expected?: unknown;
  };
}

/** Error tipado lanzado por el cliente de API para cualquier respuesta no-2xx. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.field = body.error.field;
  }
}

/**
 * Exhaustividad en tiempo de compilación: si alguna vez se agrega un 5º nivel
 * de veredicto, cualquier `switch` que use esta función en su rama `default`
 * deja de compilar hasta que se le añada un caso explícito.
 */
export function assertUnreachable(value: never): never {
  throw new Error(`Caso no manejado: ${JSON.stringify(value)}`);
}
