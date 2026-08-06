import { describe, it, expect } from 'vitest';
import { createIoc } from '../../src/models/ioc.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('createIoc for type ip', () => {
  it('builds an ip IOC carrying the derived version', () => {
    expect(createIoc('ip', '8.8.8.8')).toEqual({
      type: 'ip',
      value: '8.8.8.8',
      ipVersion: 4,
    });
  });

  it('derives version 6 for an IPv6 address', () => {
    expect(createIoc('ip', '2001:DB8::1').ipVersion).toBe(6);
  });

  it('normalises an IPv6 address to lower case', () => {
    expect(createIoc('ip', '2001:DB8::1').value).toBe('2001:db8::1');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(createIoc('ip', '  8.8.8.8  ').value).toBe('8.8.8.8');
  });

  it('throws ValidationError for a malformed address', () => {
    expect(() => createIoc('ip', '256.1.1.1')).toThrow(ValidationError);
  });
});

describe('createIoc for type hash', () => {
  it('builds a hash IOC with the algorithm derived from its length', () => {
    expect(createIoc('hash', 'd41d8cd98f00b204e9800998ecf8427e')).toEqual({
      type: 'hash',
      value: 'd41d8cd98f00b204e9800998ecf8427e',
      algorithm: 'md5',
    });
  });

  it('lower-cases an upper-case hash', () => {
    expect(createIoc('hash', 'D41D8CD98F00B204E9800998ECF8427E').value).toBe(
      'd41d8cd98f00b204e9800998ecf8427e',
    );
  });

  it('throws ValidationError when the length matches no algorithm', () => {
    expect(() => createIoc('hash', 'abc123')).toThrow(ValidationError);
  });
});

describe('createIoc for type domain', () => {
  it('builds a domain IOC', () => {
    expect(createIoc('domain', 'ejemplo.com')).toEqual({
      type: 'domain',
      value: 'ejemplo.com',
    });
  });

  it('lower-cases the domain', () => {
    expect(createIoc('domain', 'Ejemplo.COM').value).toBe('ejemplo.com');
  });

  it('strips a single trailing dot from the fully qualified form', () => {
    expect(createIoc('domain', 'ejemplo.com.').value).toBe('ejemplo.com');
  });

  it('throws ValidationError for a domain with a path', () => {
    expect(() => createIoc('domain', 'ejemplo.com/x')).toThrow(ValidationError);
  });
});

describe('createIoc input guards', () => {
  it('throws ValidationError for an unknown IOC type', () => {
    expect(() => createIoc('url', 'ejemplo.com')).toThrow(ValidationError);
  });

  it('throws ValidationError when the value is not a string', () => {
    expect(() => createIoc('ip', 42)).toThrow(ValidationError);
  });

  it('throws ValidationError for an empty value', () => {
    expect(() => createIoc('domain', '   ')).toThrow(ValidationError);
  });

  it('rejects an oversized value before doing any parsing work', () => {
    expect(() => createIoc('domain', 'a'.repeat(5000))).toThrow(ValidationError);
  });

  it('reports the offending field so the client can fix its request', () => {
    expect(() => createIoc('ip', 'nope')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'value' }),
    );
  });
});
