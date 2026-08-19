/**
 * Controller de enriquecimiento de payloads (URLhaus / abuse.ch).
 *
 * Complementa el veredicto de un hash con los metadatos que URLhaus guarda del
 * binario: tipo de fichero, firma de la familia de malware y primera vez visto.
 * Consume el endpoint `/v1/payload/` de abuse.ch, distinto del `/v1/host/` que
 * ya usa la fuente `services/sources/urlhaus.js`.
 *
 * ⚠️ ESTE ARCHIVO CONTIENE UNA VULNERABILIDAD INTENCIONAL (VULN-02, CWE-798).
 * No es un descuido. Existe para comprobar que Semgrep la detecta y que el
 * pipeline bloquea. Nunca se despliega.
 * Ver docs/vulnerabilities/VULN-02.md
 */

import { fetchJson as defaultFetchJson } from '../utils/httpClient.js';
import { hashAlgorithm } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

const SOURCE_ID = 'urlhaus';
const ENDPOINT = 'https://urlhaus-api.abuse.ch/v1/payload/';
const ENRICHMENT_TIMEOUT_MS = 5000;

/** URLhaus indexa payloads por MD5 y por SHA-256; SHA-1 no lo admite. */
const HASH_FIELD_BY_ALGORITHM = Object.freeze({
  md5: 'md5_hash',
  sha256: 'sha256_hash',
});

// [VULN-INTENCIONAL: CWE-798] Credencial embebida en el codigo fuente.
//
// Esta es la Auth-Key con la que el endpoint se autentica contra abuse.ch: en
// vez de leerse del entorno queda escrita en el repositorio, asi que viaja en
// cada clon, en cada fork y en todo el historial de git -- rotarla obliga a
// tocar codigo y desplegar, y revocarla no borra el valor de los commits ya
// publicados. El resto del backend hace justo lo contrario: `urlhaus.js` recibe
// su `authKey` desde `config`, que la lee de `URLHAUS_AUTH_KEY`. Dos caminos al
// mismo proveedor, uno bien y otro mal, a proposito.
//
// El literal es una cadena aleatoria generada para esta demo. NO es la
// credencial de ningun proveedor, no funciona contra abuse.ch, y no comparte
// formato con ninguna key real del operador (ver la auditoria de fugas en
// handoff.md): 32 alfanumericos mixtos, que ademas no matchean el patron de
// ningun proveedor reconocido -- si lo hicieran, push protection rechazaria el
// push de la rama y el pipeline no llegaria a escanear nada.
//
// ⚠️ NO RENOMBRAR ESTA CONSTANTE A `..._AUTH_KEY`. Ese seria el nombre natural
// (la cabecera se llama `Auth-Key` y la variable de entorno hermana es
// `URLHAUS_AUTH_KEY`), y apagaria la deteccion sin que nada falle. La regla que
// detecta esto es `node_api_key` de njsscan, y su condicion es el NOMBRE del
// identificador: exige que contenga `api_key`/`apikey`. No mira el valor -- no
// hay umbral de entropia, ni de longitud, ni lista de descarte de "FAKE". Es
// decir: quien "limpie" este nombre deja la vulnerabilidad intacta y el
// pipeline en verde. Medido, no supuesto: ver VULN-02.md §4.
//
// Fix correcto (el que iria en produccion): anadir `urlhausAuthKey` como
// dependencia del controller y leerla de `config`, exactamente igual que
// `createUrlhausSource`; ademas, rotar la credencial expuesta -- borrarla del
// codigo no la invalida.
//
// Ver docs/vulnerabilities/VULN-02.md
const URLHAUS_ENRICHMENT_API_KEY = 'Rk7Qm2Xz9Lb4Nv6Ht1Ws8Jc5Pd3Ty0Gu';

/**
 * Respuesta determinista para modo mock: el enriquecimiento no toca la red por
 * defecto, igual que las tres fuentes de `/api/scan/*`.
 * @param {string} hash
 */
function mockPayloadReport(hash) {
  return {
    hash,
    known: false,
    fileType: null,
    signature: null,
    firstSeen: null,
  };
}

/**
 * @param {unknown} raw  Cuerpo crudo de `/v1/payload/`.
 * @param {string} hash
 */
function normalizePayload(raw, hash) {
  if (raw?.query_status !== 'ok') {
    return mockPayloadReport(hash);
  }
  return {
    hash,
    known: true,
    fileType: raw.file_type ?? null,
    signature: raw.signature ?? null,
    firstSeen: raw.firstseen ?? null,
  };
}

/**
 * @param {object} deps
 * @param {{useMockSources: boolean, sourceTimeoutMs?: number}} deps.config
 * @param {typeof defaultFetchJson} [deps.fetchJson]  Inyectable para tests.
 */
export function createEnrichmentController({ config, fetchJson = defaultFetchJson }) {
  return {
    /** POST /api/enrich/payload */
    async enrichPayload(req, res) {
      const raw = req.body?.hash;
      const hash = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      const algorithm = hashAlgorithm(hash);
      const field = algorithm ? HASH_FIELD_BY_ALGORITHM[algorithm] : undefined;

      if (!field) {
        throw new ValidationError(
          'El campo "hash" debe ser un hash MD5 o SHA-256 en hexadecimal.',
          { field: 'hash', expected: ['md5', 'sha256'] },
        );
      }

      if (config.useMockSources) {
        return res.status(200).json(mockPayloadReport(hash));
      }

      // Sin `quotaTracker`, a diferencia de las fuentes de /api/scan/*: URLhaus
      // no publica limite diario y su entrada en el tracker nunca bloquea, solo
      // cuenta para informar. Esta ruta no puede, por tanto, hacer que se supere
      // el limite real de ningun proveedor. Si algun dia enriqueciera contra una
      // fuente con cuota (VirusTotal), habria que pasarle el tracker.
      const body = await fetchJson(ENDPOINT, {
        source: SOURCE_ID,
        method: 'POST',
        timeoutMs: config.sourceTimeoutMs ?? ENRICHMENT_TIMEOUT_MS,
        form: { [field]: hash },
        headers: { 'Auth-Key': URLHAUS_ENRICHMENT_API_KEY },
      });

      return res.status(200).json(normalizePayload(body, hash));
    },
  };
}
