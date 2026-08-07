/**
 * Tracker de cuota diaria de las fuentes externas.
 *
 * A diferencia de `historyRepository.js` (en memoria a proposito: perder el
 * historial en un restart no importa), aca SI importa: si el contador se
 * resetea a 0 en cada restart del proceso mientras el limite real del
 * proveedor sigue intacto, terminamos permitiendo llamadas que en verdad ya
 * no tenemos y no nos enteramos hasta un 429. Por eso el estado se persiste a
 * un JSON simple en disco (sin dependencias nuevas).
 *
 * Tres fuentes, tres contratos distintos con el proveedor:
 *   - abuseipdb:  el proveedor devuelve el remanente real en cada respuesta
 *                 (headers X-RateLimit-*). Ese remanente es la verdad;
 *                 `reconcileFromHeaders` lo impone sobre el contador propio.
 *   - virustotal: no expone remanente por header de forma confiable. El
 *                 unico dato que tenemos es nuestro propio contador.
 *   - urlhaus:    sin limite publicado, sin API key obligatoria. Nunca
 *                 bloquea; se cuenta solo para informar.
 *
 * El reset diario es "lazy": no hay cron. Cada vez que se lee la entrada de
 * una fuente, si su `date` no es la fecha UTC de hoy, se resetea antes de
 * usarla (ver `getEntry`).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * `backend/data/quota-state.json`, calculado desde la ubicacion de este
 * archivo -- salvo que `QUOTA_STATE_PATH` lo sobreescriba.
 *
 * Excepcion deliberada a "la config se lee una sola vez en config/index.js":
 * `loadConfig` es una funcion pura que en varios tests recibe un objeto
 * literal en vez de `process.env` (para probar el parseo de forma aislada),
 * asi que un `QUOTA_STATE_PATH` inyectado solo en `process.env` no llegaria
 * nunca a esos call sites. Leerlo aca, al nivel del modulo, es lo que permite
 * que la suite entera (incluidos los tests que arman una app en modo real)
 * escriba en un directorio temporal en vez de en el `backend/data/` real del
 * operador -- ver `vitest.config.js`.
 */
const DEFAULT_STATE_PATH =
  process.env.QUOTA_STATE_PATH?.trim() ||
  path.join(import.meta.dirname, '..', '..', '..', 'data', 'quota-state.json');

/** Fuentes reconocidas y si tienen limite o no. */
const SOURCE_IDS = Object.freeze(['abuseipdb', 'virustotal', 'urlhaus']);
const UNLIMITED_SOURCES = Object.freeze(new Set(['urlhaus']));

/** @param {() => Date} now @returns {string} YYYY-MM-DD en UTC */
function todayUtc(now) {
  return now().toISOString().slice(0, 10);
}

/** @param {() => Date} now @returns {string} ISO-8601 de la proxima medianoche UTC */
function nextMidnightUtcIso(now) {
  const d = now();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Date(next).toISOString();
}

/**
 * Entrada "en blanco" para una fuente en la fecha dada.
 * @param {string} sourceId
 * @param {string} date
 * @param {number | null} limit
 * @param {string | null} resetAt
 */
function freshEntry(sourceId, date, limit, resetAt) {
  if (sourceId === 'urlhaus') return { date, used: 0 };
  if (sourceId === 'abuseipdb') return { date, used: 0, remaining: limit, limit, resetAt };
  return { date, used: 0, limit }; // virustotal
}

/**
 * @param {object} options
 * @param {string} [options.statePath]  Ruta del JSON persistido. Inyectable para tests.
 * @param {{abuseipdb: number, virustotal: number}} options.limits  Limites diarios configurados.
 * @param {() => Date} [options.now]  Reloj inyectable, para probar el reset por fecha.
 */
export function createQuotaTracker({ statePath = DEFAULT_STATE_PATH, limits, now = () => new Date() } = {}) {
  if (!limits || typeof limits.abuseipdb !== 'number' || typeof limits.virustotal !== 'number') {
    throw new Error('createQuotaTracker requiere limits.abuseipdb y limits.virustotal (numeros).');
  }

  /** @returns {number | null} */
  function limitFor(sourceId) {
    if (sourceId === 'abuseipdb') return limits.abuseipdb;
    if (sourceId === 'virustotal') return limits.virustotal;
    return null;
  }

  /** @returns {Record<string, object>} */
  function readState() {
    try {
      return JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      // Falta el archivo (primer uso) o esta corrupto: empezar de cero es mas
      // seguro que tumbar el proceso por un JSON invalido.
      return {};
    }
  }

  /** @param {Record<string, object>} state */
  function writeState(state) {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Lee la entrada de una fuente, reseteandola in-place si la fecha UTC
   * persistida ya no es hoy. Muta `state`; quien llama decide si persiste.
   * @param {Record<string, object>} state
   * @param {string} sourceId
   */
  function getEntry(state, sourceId) {
    const today = todayUtc(now);
    const existing = state[sourceId];
    if (existing && existing.date === today) return existing;
    const fresh = freshEntry(sourceId, today, limitFor(sourceId), nextMidnightUtcIso(now));
    state[sourceId] = fresh;
    return fresh;
  }

  return {
    /**
     * @param {string} sourceId
     * @returns {boolean}
     */
    canConsume(sourceId) {
      if (UNLIMITED_SOURCES.has(sourceId)) return true;
      const state = readState();
      const entry = getEntry(state, sourceId);
      writeState(state); // el reset lazy, si ocurrio, debe quedar persistido.
      if (sourceId === 'abuseipdb') return entry.remaining > 0;
      return entry.used < entry.limit;
    },

    /** @param {string} sourceId */
    recordUsage(sourceId) {
      const state = readState();
      const entry = getEntry(state, sourceId);
      entry.used += 1;
      if (sourceId === 'abuseipdb') {
        entry.remaining = Math.max(0, entry.remaining - 1);
      }
      writeState(state);
    },

    /**
     * Sobreescribe el contador propio con la verdad que trae el proveedor.
     * Pensado para AbuseIPDB tras cada respuesta real.
     * @param {string} sourceId
     * @param {{limit: number, remaining: number, resetAt: string}} headerValues
     */
    reconcileFromHeaders(sourceId, { limit, remaining, resetAt }) {
      const state = readState();
      state[sourceId] = {
        date: todayUtc(now),
        used: Math.max(0, limit - remaining),
        remaining,
        limit,
        resetAt,
      };
      writeState(state);
    },

    /**
     * Caso defensivo: la fuente respondio 429 pese a que `canConsume` decia
     * que habia margen. Fuerza el agotamiento para el resto del dia UTC, asi
     * no se siguen gastando intentos reales contra una fuente ya agotada.
     * @param {string} sourceId
     */
    markExhausted(sourceId) {
      const state = readState();
      const entry = getEntry(state, sourceId);
      if ('remaining' in entry) entry.remaining = 0;
      if (typeof entry.limit === 'number') entry.used = entry.limit;
      writeState(state);
    },

    /**
     * Snapshot de las tres fuentes para `GET /api/quota`.
     * @returns {{source: string, limit: number|null, used: number, remaining: number|null, resetAt: string|null, unlimited: boolean}[]}
     */
    getStatus() {
      const state = readState();
      const snapshot = SOURCE_IDS.map((sourceId) => {
        const entry = getEntry(state, sourceId);
        if (UNLIMITED_SOURCES.has(sourceId)) {
          return {
            source: sourceId,
            limit: null,
            used: entry.used,
            remaining: null,
            resetAt: null,
            unlimited: true,
          };
        }
        const remaining =
          sourceId === 'abuseipdb' ? entry.remaining : Math.max(0, entry.limit - entry.used);
        return {
          source: sourceId,
          limit: entry.limit,
          used: entry.used,
          remaining,
          resetAt: entry.resetAt ?? nextMidnightUtcIso(now),
          unlimited: false,
        };
      });
      writeState(state); // idem: persistir cualquier reset lazy que haya ocurrido.
      return snapshot;
    },
  };
}
