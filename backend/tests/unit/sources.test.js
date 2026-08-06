import { describe, it, expect } from 'vitest';
import { createAbuseipdbSource } from '../../src/services/sources/abuseipdb.js';
import { createVirustotalSource } from '../../src/services/sources/virustotal.js';
import { createUrlhausSource } from '../../src/services/sources/urlhaus.js';
import { createIoc } from '../../src/models/ioc.js';
import { SourceError } from '../../src/utils/errors.js';

const mockOptions = { useMock: true, timeoutMs: 1000 };

describe('source interface', () => {
  it('exposes the same shape for all three sources', () => {
    const sources = [
      createAbuseipdbSource(mockOptions),
      createVirustotalSource(mockOptions),
      createUrlhausSource(mockOptions),
    ];
    for (const source of sources) {
      expect(typeof source.id).toBe('string');
      expect(typeof source.supports).toBe('function');
      expect(typeof source.lookup).toBe('function');
    }
  });

  it('has abuseipdb support only ip IOCs', () => {
    const source = createAbuseipdbSource(mockOptions);
    expect([source.supports('ip'), source.supports('hash'), source.supports('domain')])
      .toEqual([true, false, false]);
  });

  it('has virustotal support only hash IOCs', () => {
    const source = createVirustotalSource(mockOptions);
    expect([source.supports('ip'), source.supports('hash'), source.supports('domain')])
      .toEqual([false, true, false]);
  });

  it('has urlhaus support only domain IOCs', () => {
    const source = createUrlhausSource(mockOptions);
    expect([source.supports('ip'), source.supports('hash'), source.supports('domain')])
      .toEqual([false, false, true]);
  });
});

describe('mock mode determinism', () => {
  it('returns the clean verdict for the pinned clean IP', async () => {
    const source = createAbuseipdbSource(mockOptions);
    const report = await source.lookup(createIoc('ip', '192.0.2.1'));
    expect(report.level).toBe('clean');
  });

  it('returns the suspicious verdict for the pinned suspicious IP', async () => {
    const source = createAbuseipdbSource(mockOptions);
    const report = await source.lookup(createIoc('ip', '198.51.100.14'));
    expect(report.level).toBe('suspicious');
  });

  it('returns the malicious verdict for the pinned malicious IP', async () => {
    const source = createAbuseipdbSource(mockOptions);
    const report = await source.lookup(createIoc('ip', '203.0.113.66'));
    expect(report.level).toBe('malicious');
  });

  it('returns the three verdicts for the pinned hashes', async () => {
    const source = createVirustotalSource(mockOptions);
    const levels = [];
    for (const value of [
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      '44d88612fea8a8f36de82e1278abb02f',
    ]) {
      levels.push((await source.lookup(createIoc('hash', value))).level);
    }
    expect(levels).toEqual(['clean', 'suspicious', 'malicious']);
  });

  it('returns the three verdicts for the pinned domains', async () => {
    const source = createUrlhausSource(mockOptions);
    const levels = [];
    for (const value of ['ejemplo.com', 'sospechoso.example', 'malicious.example']) {
      levels.push((await source.lookup(createIoc('domain', value))).level);
    }
    expect(levels).toEqual(['clean', 'suspicious', 'malicious']);
  });

  it('gives the same verdict twice for an unpinned value', async () => {
    const source = createUrlhausSource(mockOptions);
    const ioc = createIoc('domain', 'cualquier-cosa.org');
    const first = await source.lookup(ioc);
    const second = await source.lookup(ioc);
    expect(first.level).toBe(second.level);
  });

  it('never contacts the network in mock mode', async () => {
    const source = createAbuseipdbSource({
      ...mockOptions,
      fetchJson: () => {
        throw new Error('la red no debe tocarse en modo mock');
      },
    });
    await expect(source.lookup(createIoc('ip', '192.0.2.1'))).resolves.toBeDefined();
  });
});

describe('real mode requests', () => {
  it('sends the AbuseIPDB api key in the Key header, never in the query string', async () => {
    let seen;
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'test-key',
      timeoutMs: 1000,
      fetchJson: (url, options) => {
        seen = { url, options };
        return { data: { abuseConfidenceScore: 0, totalReports: 0 } };
      },
    });
    await source.lookup(createIoc('ip', '192.0.2.1'));
    expect(seen.options.headers.Key).toBe('test-key');
    expect(seen.url).not.toContain('test-key');
  });

  it('url-encodes the IOC into the AbuseIPDB query string', async () => {
    let seen;
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: (url) => {
        seen = url;
        return { data: { abuseConfidenceScore: 0, totalReports: 0 } };
      },
    });
    await source.lookup(createIoc('ip', '2001:db8::1'));
    expect(seen).toContain('ipAddress=2001%3Adb8%3A%3A1');
  });

  it('sends the VirusTotal api key in the x-apikey header', async () => {
    let seen;
    const source = createVirustotalSource({
      useMock: false,
      apiKey: 'vt-key',
      timeoutMs: 1000,
      fetchJson: (url, options) => {
        seen = options;
        return {
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 0,
                harmless: 50,
                undetected: 5,
                timeout: 0,
              },
            },
          },
        };
      },
    });
    await source.lookup(
      createIoc('hash', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
    );
    expect(seen.headers['x-apikey']).toBe('vt-key');
  });

  it('reads a VirusTotal 404 as an unknown file rather than a source failure', async () => {
    const source = createVirustotalSource({
      useMock: false,
      apiKey: 'vt-key',
      timeoutMs: 1000,
      fetchJson: () => {
        const error = new SourceError('not found', {
          source: 'virustotal',
          kind: 'unavailable',
        });
        error.httpStatus = 404;
        throw error;
      },
    });
    const report = await source.lookup(
      createIoc('hash', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
    );
    expect(report).toMatchObject({ level: 'clean', confidence: 0.2 });
  });

  it('posts the domain as a form field to URLhaus', async () => {
    let seen;
    const source = createUrlhausSource({
      useMock: false,
      timeoutMs: 1000,
      fetchJson: (url, options) => {
        seen = options;
        return { query_status: 'no_results' };
      },
    });
    await source.lookup(createIoc('domain', 'ejemplo.com'));
    expect(seen).toMatchObject({ method: 'POST', form: { host: 'ejemplo.com' } });
  });

  it('lets a source failure propagate as a SourceError for the caller to degrade', async () => {
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: () => {
        throw new SourceError('timeout', { source: 'abuseipdb', kind: 'timeout' });
      },
    });
    await expect(source.lookup(createIoc('ip', '192.0.2.1'))).rejects.toThrow(SourceError);
  });
});
