/**
 * Configuracion centralizada.
 *
 * Una sola lectura de `process.env`, con defaults sanos y validacion estricta.
 * Si la configuracion es invalida el proceso falla AL ARRANCAR (ver `index.js`),
 * nunca a mitad de un request: descubrir que falta una API key en la peticion
 * del usuario numero mil es un modo de fallo inaceptable.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigurationError } from '../utils/errors.js';

const PACKAGE_JSON = path.join(import.meta.dirname, '..', '..', 'package.json');

/** @returns {string} */
function readVersion() {
  try {
    return JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {string} name
 * @param {boolean} fallback
 */
function readBoolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ConfigurationError(
    `${name} debe ser "true" o "false"; se recibio "${raw}".`,
  );
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {string} name
 * @param {number} fallback
 * @param {{min: number, max: number}} range
 */
function readInteger(env, name, fallback, { min, max }) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ConfigurationError(`${name} debe ser un entero; se recibio "${raw}".`);
  }
  if (value < min || value > max) {
    throw new ConfigurationError(`${name} debe estar entre ${min} y ${max}; se recibio ${value}.`);
  }
  return value;
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {string} name
 */
function readRequiredSecret(env, name) {
  const raw = env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ConfigurationError(
      `Falta ${name}. Es obligatoria con USE_MOCK_SOURCES=false; ` +
        'definela en el entorno o vuelve al modo mock.',
    );
  }
  return raw.trim();
}

/**
 * @param {Record<string,string|undefined>} env
 * @returns {string[]}
 */
function readCorsOrigins(env) {
  const raw = env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new ConfigurationError('CORS_ORIGINS no puede quedar vacio.');
  }
  if (origins.includes('*')) {
    // Un comodin dejaria que cualquier sitio llamara a esta API desde el
    // navegador de la victima. Se rechaza en configuracion, no en revision.
    throw new ConfigurationError(
      'CORS_ORIGINS no admite "*": enumera los origenes permitidos explicitamente.',
    );
  }
  return origins;
}

/**
 * Construye la configuracion a partir de un entorno dado.
 * Es una funcion pura: se le puede pasar un entorno de prueba.
 *
 * @param {Record<string,string|undefined>} [env]
 */
export function loadConfig(env = process.env) {
  const useMockSources = readBoolean(env, 'USE_MOCK_SOURCES', true);

  return Object.freeze({
    nodeEnv: env.NODE_ENV ?? 'development',
    version: readVersion(),
    port: readInteger(env, 'PORT', 3000, { min: 1, max: 65535 }),

    useMockSources,
    sourceTimeoutMs: readInteger(env, 'SOURCE_TIMEOUT_MS', 5000, { min: 100, max: 60000 }),
    abuseipdbApiKey: useMockSources ? null : readRequiredSecret(env, 'ABUSEIPDB_API_KEY'),
    virustotalApiKey: useMockSources ? null : readRequiredSecret(env, 'VIRUSTOTAL_API_KEY'),
    // URLhaus no exige credencial para la Host API; si el operador tiene una
    // Auth-Key de abuse.ch se usa, pero nunca es obligatoria.
    urlhausAuthKey: env.URLHAUS_AUTH_KEY?.trim() || null,

    historyMaxEntries: readInteger(env, 'HISTORY_MAX_ENTRIES', 200, { min: 1, max: 10000 }),
    historyMaxPageSize: readInteger(env, 'HISTORY_MAX_PAGE_SIZE', 100, { min: 1, max: 500 }),

    corsOrigins: Object.freeze(readCorsOrigins(env)),
    rateLimitWindowMs: readInteger(env, 'RATE_LIMIT_WINDOW_MS', 60_000, {
      min: 1000,
      max: 3_600_000,
    }),
    rateLimitMax: readInteger(env, 'RATE_LIMIT_MAX', 60, { min: 1, max: 100_000 }),
  });
}

/** Configuracion efectiva del proceso. */
export const config = loadConfig();
