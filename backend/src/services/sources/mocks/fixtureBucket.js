/**
 * Selector determinista de escenario para el modo mock.
 *
 * Los mocks devuelven la forma CRUDA de cada API upstream, no un SourceReport
 * ya normalizado: asi el modo mock ejercita exactamente el mismo camino de
 * normalizacion que el modo real, y un bug de traduccion aparece en desarrollo
 * y no en produccion.
 *
 * Para cualquier valor no listado explicitamente, el escenario se deriva del
 * propio valor: mismo input -> mismo veredicto, siempre. Sin aleatoriedad, sin
 * estado. El frontend necesita poder provocar los tres estados de la mascota a
 * voluntad.
 */

/** @type {readonly ('clean'|'suspicious'|'malicious')[]} */
export const BUCKETS = Object.freeze(['clean', 'suspicious', 'malicious']);

/**
 * Valores de demostracion documentados en `.env.example`: dan siempre el mismo
 * escenario para que el frontend pueda probar los tres estados de la mascota.
 */
const PINNED = new Map([
  // IPs (rangos de documentacion RFC 5737 / RFC 3849)
  ['192.0.2.1', 'clean'],
  ['198.51.100.14', 'suspicious'],
  ['203.0.113.66', 'malicious'],
  ['2001:db8::1', 'clean'],
  // Hashes
  ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'clean'],
  ['da39a3ee5e6b4b0d3255bfef95601890afd80709', 'suspicious'],
  ['44d88612fea8a8f36de82e1278abb02f', 'malicious'],
  // Dominios (TLD reservados RFC 2606)
  ['ejemplo.com', 'clean'],
  ['sospechoso.example', 'suspicious'],
  ['malicious.example', 'malicious'],
]);

/**
 * @param {string} value  Valor normalizado del IOC.
 * @returns {'clean'|'suspicious'|'malicious'}
 */
export function bucketFor(value) {
  const pinned = PINNED.get(value);
  if (pinned) return pinned;

  // Suma de codepoints: barata, estable y suficiente para repartir escenarios.
  // No es un hash criptografico ni pretende serlo.
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    sum = (sum + value.charCodeAt(i)) % 997;
  }
  return BUCKETS[sum % BUCKETS.length];
}
