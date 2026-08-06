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

  it('completes quickly on a long adversarial input instead of backtracking', () => {
    const adversarial = `${'a-'.repeat(5000)}!`;
    const startedAt = performance.now();
    expect(isValidDomain(adversarial)).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(50);
  });
});
