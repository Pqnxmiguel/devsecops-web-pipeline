/**
 * Detección pragmática (NO NLP) de si el usuario le está preguntando al
 * personaje por la cuota restante de las fuentes externas, en vez de pasarle
 * un IOC a escanear. `useConversation.submit` la consulta ANTES de
 * `detectIocType`, así que este helper decide si el turno se desvía por
 * completo del flujo de scan.
 *
 * Es un allowlist fijo de frases/palabras clave en español, nunca una
 * interpolación del texto del usuario en nada ejecutable/HTML — no hay
 * superficie de inyección acá.
 */
const QUOTA_KEYWORDS = [
  'cuota',
  'cuantas consultas',
  'consultas quedan',
  'cuanto queda',
  'cuanto me queda',
  'cuanto nos queda',
  'limite diario',
  'limite de consultas',
  'rate limit',
  '/quota',
] as const;

/** minúsculas + sin tildes, para que "cuánto" y "cuanto" matcheen igual. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function isQuotaQuery(text: string): boolean {
  const normalized = normalize(text);
  if (normalized === '') return false;
  return QUOTA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
