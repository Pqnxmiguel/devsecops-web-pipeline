import { describe, expect, it } from 'vitest';
import { isQuotaQuery } from './quotaQuery';

describe('isQuotaQuery', () => {
  it('matches the exact phrase the user asked for', () => {
    expect(isQuotaQuery('cuantas consultas me quedan')).toBe(true);
    expect(isQuotaQuery('¿Cuántas consultas me quedan?')).toBe(true);
  });

  it('matches a handful of reasonable variations', () => {
    expect(isQuotaQuery('cuota')).toBe(true);
    expect(isQuotaQuery('¿cuánta cuota me queda?')).toBe(true);
    expect(isQuotaQuery('cuánto queda de cuota hoy')).toBe(true);
    expect(isQuotaQuery('cuánto me queda')).toBe(true);
    expect(isQuotaQuery('cuál es el límite diario')).toBe(true);
    expect(isQuotaQuery('límite de consultas')).toBe(true);
    expect(isQuotaQuery('rate limit')).toBe(true);
    expect(isQuotaQuery('/quota')).toBe(true);
    expect(isQuotaQuery('cuántas consultas quedan hoy')).toBe(true);
  });

  it('is case- and accent-insensitive', () => {
    expect(isQuotaQuery('CUOTA')).toBe(true);
    expect(isQuotaQuery('Cuánto Queda')).toBe(true);
  });

  it('returns false for empty/whitespace input', () => {
    expect(isQuotaQuery('')).toBe(false);
    expect(isQuotaQuery('   ')).toBe(false);
  });

  it('never matches a real IPv4/IPv6 IOC', () => {
    expect(isQuotaQuery('203.0.113.66')).toBe(false);
    expect(isQuotaQuery('2001:db8::1')).toBe(false);
  });

  it('never matches a real hash IOC (md5/sha1/sha256)', () => {
    expect(isQuotaQuery('44d88612fea8a8f36de82e1278abb02f')).toBe(false);
    expect(isQuotaQuery('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe(false);
    expect(
      isQuotaQuery('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'.slice(0, 64)),
    ).toBe(false);
  });

  it('never matches a real domain IOC', () => {
    expect(isQuotaQuery('example.org')).toBe(false);
    expect(isQuotaQuery('malicious-test-domain.example.com')).toBe(false);
    expect(isQuotaQuery('sub.dominio-de-prueba.io')).toBe(false);
  });

  it('does not match unrelated free text', () => {
    expect(isQuotaQuery('hola, como estas')).toBe(false);
    expect(isQuotaQuery('escaneame esta ip')).toBe(false);
  });
});
