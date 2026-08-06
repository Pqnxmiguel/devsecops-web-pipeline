import { describe, expect, it } from 'vitest';
import { detectIocType } from './iocDetect';

describe('detectIocType', () => {
  it('detects an IPv4', () => {
    expect(detectIocType('192.0.2.1')).toBe('ip');
  });

  it('detects a hash by length (md5/sha1/sha256)', () => {
    expect(detectIocType('44d88612fea8a8f36de82e1278abb02f')).toBe('hash'); // 32
    expect(detectIocType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash'); // 40
  });

  it('detects a domain', () => {
    expect(detectIocType('ejemplo.com')).toBe('domain');
  });

  it('returns null for empty input', () => {
    expect(detectIocType('   ')).toBeNull();
  });
});
