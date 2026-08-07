import { describe, it, expect, vi } from 'vitest';
import { createAbuseipdbSource } from '../../src/services/sources/abuseipdb.js';
import { createVirustotalSource } from '../../src/services/sources/virustotal.js';
import { createUrlhausSource } from '../../src/services/sources/urlhaus.js';
import { createIoc } from '../../src/models/ioc.js';
import { SourceError } from '../../src/utils/errors.js';

/**
 * Gating de cuota: cada fuente real debe cortar ANTES de tocar la red cuando
 * el tracker dice que no queda margen. `fetchJson` falla el test si llega a
 * invocarse -- es la garantia de que el corte ocurre antes de cualquier
 * intento de red.
 */
function neverCalledFetchJson() {
  return vi.fn(() => {
    throw new Error('fetchJson no debia invocarse: la cuota ya estaba agotada.');
  });
}

/** @param {boolean} allowed */
function fakeQuotaTracker(allowed) {
  return {
    canConsume: vi.fn(() => allowed),
    recordUsage: vi.fn(),
    reconcileFromHeaders: vi.fn(),
    markExhausted: vi.fn(),
  };
}

describe('gating de cuota: AbuseIPDB', () => {
  it('lanza SourceError kind:"rate_limit" sin llamar a fetchJson cuando la cuota esta agotada', async () => {
    const quotaTracker = fakeQuotaTracker(false);
    const fetchJson = neverCalledFetchJson();
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson,
      quotaTracker,
    });

    await expect(source.lookup(createIoc('ip', '192.0.2.1'))).rejects.toMatchObject({
      kind: 'rate_limit',
      source: 'abuseipdb',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('consulta canConsume con el id de la fuente', async () => {
    const quotaTracker = fakeQuotaTracker(false);
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: neverCalledFetchJson(),
      quotaTracker,
    });
    await source.lookup(createIoc('ip', '192.0.2.1')).catch(() => {});
    expect(quotaTracker.canConsume).toHaveBeenCalledWith('abuseipdb');
  });

  it('registra el uso y reconcilia con los headers tras una llamada real exitosa', async () => {
    const quotaTracker = fakeQuotaTracker(true);
    const fetchJson = vi.fn((url, options) => {
      options.onHeaders?.(
        new Headers({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '950',
          'x-ratelimit-reset': '1754611200',
        }),
      );
      return { data: { abuseConfidenceScore: 0, totalReports: 0 } };
    });
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson,
      quotaTracker,
    });

    await source.lookup(createIoc('ip', '192.0.2.1'));

    expect(quotaTracker.recordUsage).toHaveBeenCalledWith('abuseipdb');
    expect(quotaTracker.reconcileFromHeaders).toHaveBeenCalledWith('abuseipdb', {
      limit: 1000,
      remaining: 950,
      resetAt: new Date(1754611200 * 1000).toISOString(),
    });
  });

  it('nunca llama a quotaTracker en modo mock', async () => {
    const quotaTracker = fakeQuotaTracker(false);
    const source = createAbuseipdbSource({ useMock: true, timeoutMs: 1000, quotaTracker });
    await source.lookup(createIoc('ip', '192.0.2.1'));
    expect(quotaTracker.canConsume).not.toHaveBeenCalled();
  });

  it('marca la fuente como agotada si el proveedor responde 429 pese al gating', async () => {
    const quotaTracker = fakeQuotaTracker(true);
    const source = createAbuseipdbSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: () => {
        throw new SourceError('rate limited', { source: 'abuseipdb', kind: 'rate_limit' });
      },
      quotaTracker,
    });

    await expect(source.lookup(createIoc('ip', '192.0.2.1'))).rejects.toThrow(SourceError);
    expect(quotaTracker.markExhausted).toHaveBeenCalledWith('abuseipdb');
  });
});

describe('gating de cuota: VirusTotal', () => {
  const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('lanza SourceError kind:"rate_limit" sin llamar a fetchJson cuando la cuota esta agotada', async () => {
    const quotaTracker = fakeQuotaTracker(false);
    const fetchJson = neverCalledFetchJson();
    const source = createVirustotalSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson,
      quotaTracker,
    });

    await expect(source.lookup(createIoc('hash', hash))).rejects.toMatchObject({
      kind: 'rate_limit',
      source: 'virustotal',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('registra el uso tras una llamada real exitosa', async () => {
    const quotaTracker = fakeQuotaTracker(true);
    const source = createVirustotalSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: () => ({
        data: {
          attributes: {
            last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 50, undetected: 5 },
          },
        },
      }),
      quotaTracker,
    });
    await source.lookup(createIoc('hash', hash));
    expect(quotaTracker.recordUsage).toHaveBeenCalledWith('virustotal');
  });

  it('marca la fuente como agotada si el proveedor responde 429 pese al gating', async () => {
    const quotaTracker = fakeQuotaTracker(true);
    const source = createVirustotalSource({
      useMock: false,
      apiKey: 'k',
      timeoutMs: 1000,
      fetchJson: () => {
        throw new SourceError('rate limited', { source: 'virustotal', kind: 'rate_limit' });
      },
      quotaTracker,
    });
    await expect(source.lookup(createIoc('hash', hash))).rejects.toThrow(SourceError);
    expect(quotaTracker.markExhausted).toHaveBeenCalledWith('virustotal');
  });
});

describe('gating de cuota: URLhaus', () => {
  it('nunca bloquea: canConsume siempre true en el tracker real, y aca solo se propaga', async () => {
    const quotaTracker = fakeQuotaTracker(true);
    const source = createUrlhausSource({
      useMock: false,
      timeoutMs: 1000,
      fetchJson: () => ({ query_status: 'no_results' }),
      quotaTracker,
    });
    await source.lookup(createIoc('domain', 'ejemplo.com'));
    expect(quotaTracker.recordUsage).toHaveBeenCalledWith('urlhaus');
  });

  it('respeta igualmente el corte si algun dia canConsume diera false', async () => {
    const quotaTracker = fakeQuotaTracker(false);
    const fetchJson = neverCalledFetchJson();
    const source = createUrlhausSource({
      useMock: false,
      timeoutMs: 1000,
      fetchJson,
      quotaTracker,
    });
    await expect(source.lookup(createIoc('domain', 'ejemplo.com'))).rejects.toMatchObject({
      kind: 'rate_limit',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
