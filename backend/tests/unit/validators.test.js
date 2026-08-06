import { describe, it, expect } from 'vitest';
import {
  classifyIp,
  hashAlgorithm,
  isValidDomain,
} from '../../src/utils/validators.js';

describe('classifyIp', () => {
  it('returns 4 for a dotted-quad IPv4 address', () => {
    expect(classifyIp('1.2.3.4')).toBe(4);
  });

  it('returns 6 for a compressed IPv6 address', () => {
    expect(classifyIp('2001:db8::1')).toBe(6);
  });

  it('returns 0 for an octet above 255', () => {
    expect(classifyIp('999.1.1.1')).toBe(0);
  });

  it('returns 0 for CIDR notation because an IOC is a single address', () => {
    expect(classifyIp('10.0.0.0/8')).toBe(0);
  });

  it('returns 0 for a non-string input', () => {
    expect(classifyIp(null)).toBe(0);
  });
});

describe('hashAlgorithm', () => {
  it('derives md5 from a 32-character hex string', () => {
    expect(hashAlgorithm('d41d8cd98f00b204e9800998ecf8427e')).toBe('md5');
  });

  it('derives sha1 from a 40-character hex string', () => {
    expect(hashAlgorithm('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('sha1');
  });

  it('derives sha256 from a 64-character hex string', () => {
    expect(
      hashAlgorithm(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ),
    ).toBe('sha256');
  });

  it('returns null for a hex string of a length no algorithm uses', () => {
    expect(hashAlgorithm('abcdef')).toBeNull();
  });

  it('returns null when the string has the right length but a non-hex char', () => {
    expect(hashAlgorithm('z41d8cd98f00b204e9800998ecf8427e')).toBeNull();
  });
});

describe('isValidDomain', () => {
  it('accepts a two-label domain', () => {
    expect(isValidDomain('ejemplo.com')).toBe(true);
  });

  it('accepts a subdomain with hyphens inside labels', () => {
    expect(isValidDomain('mi-sub.ejemplo.com')).toBe(true);
  });

  it('accepts a punycode label', () => {
    expect(isValidDomain('xn--80ak6aa92e.com')).toBe(true);
  });

  it('rejects a single label with no dot', () => {
    expect(isValidDomain('localhost')).toBe(false);
  });

  it('rejects a label that starts with a hyphen', () => {
    expect(isValidDomain('-mal.com')).toBe(false);
  });

  it('rejects a label longer than 63 characters', () => {
    expect(isValidDomain(`${'a'.repeat(64)}.com`)).toBe(false);
  });

  it('rejects a name longer than 253 characters', () => {
    const longName = `${Array.from({ length: 10 }, () => 'a'.repeat(25)).join('.')}.com`;
    expect(isValidDomain(longName)).toBe(false);
  });

  it('rejects an all-numeric TLD so an IPv4 is not read as a domain', () => {
    expect(isValidDomain('1.2.3.4')).toBe(false);
  });

  it('rejects a value carrying a URL scheme', () => {
    expect(isValidDomain('http://ejemplo.com')).toBe(false);
  });

  it('rejects a value carrying a path', () => {
    expect(isValidDomain('ejemplo.com/malware')).toBe(false);
  });

  it('rejects a value carrying a port', () => {
    expect(isValidDomain('ejemplo.com:8080')).toBe(false);
  });

  it('rejects an empty label produced by a double dot', () => {
    expect(isValidDomain('ejemplo..com')).toBe(false);
  });

  it('rejects a shell metacharacter smuggled into the value', () => {
    expect(isValidDomain('ejemplo.com; rm -rf /')).toBe(false);
  });

  it('rejects an over-long input via the length guard, before parsing', () => {
    // MAX_DOMAIN_LENGTH = 253. Cualquier cosa mas larga sale en la primera
    // comparacion; este test cubre la guarda, no el parseo.
    expect(isValidDomain(`${'a-'.repeat(5000)}!`)).toBe(false);
  });

  // Red de regresion contra ReDoS.
  //
  // El input DEBE sobrevivir la guarda de longitud (<= 253) para que el bucle
  // de parseo se ejecute de verdad. Un input de 10.000 chars retorna tras una
  // sola comparacion de enteros y no prueba absolutamente nada.
  //
  // La forma de abajo (N etiquetas de un char + un char final invalido) es el
  // input que hace explotar el regex de validacion de dominio mas copiado de
  // internet, /^([a-zA-Z0-9]+([\-\.]{1}[a-zA-Z0-9]+)*\.)+[a-zA-Z]{2,}$/, cuyo
  // grupo interno opcional es ambiguo con el `+` externo. Medido en Node 22:
  //
  //     18 etiquetas ( 37 chars) ->     33 ms
  //     22 etiquetas ( 45 chars) ->    607 ms
  //     26 etiquetas ( 53 chars) ->  9.233 ms
  //    125 etiquetas (251 chars) ->  no termina
  //
  // Es decir: duplica cada ~2 etiquetas, y la guarda de 253 chars NO protege.
  // Si alguien refactoriza isValidDomain a ese regex, este test lo atrapa.
  it('parses a max-length adversarial input in linear time (no backtracking)', () => {
    // 125 etiquetas validas + una final invalida: recorre el bucle entero
    // antes de fallar. 251 chars, justo bajo el limite.
    const adversarial = `${'a.'.repeat(125)}!`;
    expect(adversarial.length).toBeLessThanOrEqual(253);

    const startedAt = performance.now();
    expect(isValidDomain(adversarial)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(50);
  });

  it('parses a full-traversal input in linear time (fails only at the TLD)', () => {
    // Tres etiquetas de 63 chars (el maximo) que pasan todas, y un TLD
    // numerico que falla en el ultimo bucle: el peor caso de trabajo util.
    const label = `${'a-'.repeat(31)}a`;
    const adversarial = `${label}.${label}.${label}.123`;
    expect(adversarial.length).toBeLessThanOrEqual(253);

    const startedAt = performance.now();
    expect(isValidDomain(adversarial)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(50);
  });
});
