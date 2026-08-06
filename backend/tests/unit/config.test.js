import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { ConfigurationError } from '../../src/utils/errors.js';

const realMode = {
  USE_MOCK_SOURCES: 'false',
  ABUSEIPDB_API_KEY: 'a-key',
  VIRUSTOTAL_API_KEY: 'v-key',
};

describe('loadConfig defaults', () => {
  it('defaults to mock sources when the variable is absent', () => {
    expect(loadConfig({}).useMockSources).toBe(true);
  });

  it('defaults the port to 3000', () => {
    expect(loadConfig({}).port).toBe(3000);
  });

  it('defaults the source timeout to 5000 ms', () => {
    expect(loadConfig({}).sourceTimeoutMs).toBe(5000);
  });

  it('caps the in-memory history by default', () => {
    expect(loadConfig({}).historyMaxEntries).toBe(200);
  });

  it('exposes the package version', () => {
    expect(loadConfig({}).version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns a frozen object so nothing can mutate config at runtime', () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });
});

describe('loadConfig parsing', () => {
  it('reads USE_MOCK_SOURCES=false as real mode', () => {
    expect(loadConfig(realMode).useMockSources).toBe(false);
  });

  it('rejects a boolean variable that is neither true nor false', () => {
    expect(() => loadConfig({ USE_MOCK_SOURCES: 'yes' })).toThrow(ConfigurationError);
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ PORT: 'ochenta' })).toThrow(ConfigurationError);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigurationError);
  });

  it('splits and trims the CORS origin list', () => {
    expect(
      loadConfig({ CORS_ORIGINS: 'http://a.test , http://b.test' }).corsOrigins,
    ).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => loadConfig({ CORS_ORIGINS: '*' })).toThrow(ConfigurationError);
  });
});

describe('loadConfig credential requirements', () => {
  it('fails fast when real mode is requested without the AbuseIPDB key', () => {
    expect(() =>
      loadConfig({ USE_MOCK_SOURCES: 'false', VIRUSTOTAL_API_KEY: 'v' }),
    ).toThrow(ConfigurationError);
  });

  it('names the missing variable so the operator can fix it', () => {
    expect(() =>
      loadConfig({ USE_MOCK_SOURCES: 'false', VIRUSTOTAL_API_KEY: 'v' }),
    ).toThrow(/ABUSEIPDB_API_KEY/);
  });

  it('fails fast when real mode is requested without the VirusTotal key', () => {
    expect(() =>
      loadConfig({ USE_MOCK_SOURCES: 'false', ABUSEIPDB_API_KEY: 'a' }),
    ).toThrow(/VIRUSTOTAL_API_KEY/);
  });

  it('treats a blank key as missing', () => {
    expect(() => loadConfig({ ...realMode, ABUSEIPDB_API_KEY: '   ' })).toThrow(
      ConfigurationError,
    );
  });

  it('accepts real mode when every required key is present', () => {
    expect(loadConfig(realMode).abuseipdbApiKey).toBe('a-key');
  });

  it('does not require any key in mock mode', () => {
    expect(() => loadConfig({ USE_MOCK_SOURCES: 'true' })).not.toThrow();
  });
});
