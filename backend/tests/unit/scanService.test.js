import { describe, it, expect, beforeEach } from 'vitest';
import { createScanService } from '../../src/services/scanService.js';
import { createInMemoryHistoryRepository } from '../../src/models/historyRepository.js';
import { createSourceReport } from '../../src/models/verdict.js';
import { ValidationError, SourceError, AppError } from '../../src/utils/errors.js';

/** Fuente de prueba con la misma interfaz que las reales. */
function stubSource(id, iocType, behaviour) {
  return {
    id,
    supports: (type) => type === iocType,
    lookup: behaviour,
  };
}

const cleanReport = (source) =>
  createSourceReport({ source, level: 'clean', score: 0, confidence: 0.5 });
const maliciousReport = (source) =>
  createSourceReport({ source, level: 'malicious', score: 90, confidence: 0.9 });

describe('scanService', () => {
  let history;

  beforeEach(() => {
    history = createInMemoryHistoryRepository({ maxEntries: 10 });
  });

  function serviceWith(sources) {
    return createScanService({ sources, historyRepository: history, useMock: true });
  }

  it('returns a scan carrying the normalised IOC', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    const scan = await service.scan('ip', '  192.0.2.1 ');
    expect(scan.ioc).toEqual({ type: 'ip', value: '192.0.2.1', ipVersion: 4 });
  });

  it('aggregates the source reports into a verdict', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => maliciousReport('s'))]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.verdict.level).toBe('malicious');
  });

  it('stamps a unique id on every scan', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    const first = await service.scan('ip', '192.0.2.1');
    const second = await service.scan('ip', '192.0.2.1');
    expect(first.id).not.toBe(second.id);
  });

  it('records whether the scan was resolved with mocked sources', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    expect((await service.scan('ip', '192.0.2.1')).mock).toBe(true);
  });

  it('stores the scan in the history repository', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(history.list({ limit: 10, offset: 0 }).items[0].id).toBe(scan.id);
  });

  it('propagates a ValidationError for an invalid value', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    await expect(service.scan('ip', 'no-soy-una-ip')).rejects.toThrow(ValidationError);
  });

  it('does not record a rejected input in the history', async () => {
    const service = serviceWith([stubSource('s', 'ip', async () => cleanReport('s'))]);
    await service.scan('ip', 'no-soy-una-ip').catch(() => {});
    expect(history.count()).toBe(0);
  });

  it('only queries the sources that support the IOC type', async () => {
    const queried = [];
    const service = serviceWith([
      stubSource('ip-source', 'ip', async () => {
        queried.push('ip-source');
        return cleanReport('ip-source');
      }),
      stubSource('hash-source', 'hash', async () => {
        queried.push('hash-source');
        return cleanReport('hash-source');
      }),
    ]);
    await service.scan('ip', '192.0.2.1');
    expect(queried).toEqual(['ip-source']);
  });

  it('degrades a failing source instead of failing the whole scan', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new SourceError('down', { source: 's', kind: 'timeout' });
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.sources[0]).toMatchObject({ degraded: true, details: { reason: 'timeout' } });
  });

  it('reports zero confidence when the only source is degraded', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new SourceError('down', { source: 's', kind: 'timeout' });
      }),
    ]);
    expect((await service.scan('ip', '192.0.2.1')).verdict.confidence).toBe(0);
  });

  it('returns an unknown verdict -- not clean -- when the only source is degraded', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new SourceError('down', { source: 's', kind: 'timeout' });
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.verdict).toMatchObject({ level: 'unknown', score: null });
  });

  it('returns unknown when the source is rate limited (exhausted daily quota)', async () => {
    const service = serviceWith([
      stubSource('abuseipdb', 'ip', async () => {
        throw new SourceError('429', { source: 'abuseipdb', kind: 'rate_limit' });
      }),
    ]);
    const scan = await service.scan('ip', '203.0.113.66');
    expect(scan.verdict.level).toBe('unknown');
  });

  it('still lists the degraded source in sources[] so the client can see why', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new SourceError('429', { source: 's', kind: 'rate_limit' });
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.sources).toHaveLength(1);
    expect(scan.sources[0]).toMatchObject({
      source: 's',
      degraded: true,
      level: 'unknown',
      details: { reason: 'rate_limit' },
    });
  });

  it('keeps the answering source verdict and lowers confidence when a sibling degrades', async () => {
    const service = serviceWith([
      stubSource('good', 'ip', async () => cleanReport('good')),
      stubSource('bad', 'ip', async () => {
        throw new SourceError('down', { source: 'bad', kind: 'timeout' });
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.verdict.level).toBe('clean');
    expect(scan.verdict.confidence).toBe(0.25); // 0.5 de media * 0.5 de cobertura
  });

  it('degrades an unexpected non-SourceError failure too', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new TypeError('cannot read property of undefined');
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.sources[0].degraded).toBe(true);
  });

  it('does not leak an unexpected error message into the response', async () => {
    const service = serviceWith([
      stubSource('s', 'ip', async () => {
        throw new TypeError('cannot read property of undefined');
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(JSON.stringify(scan)).not.toContain('cannot read property');
  });

  it('keeps a healthy source usable when a sibling source fails', async () => {
    const service = serviceWith([
      stubSource('good', 'ip', async () => maliciousReport('good')),
      stubSource('bad', 'ip', async () => {
        throw new SourceError('down', { source: 'bad', kind: 'unavailable' });
      }),
    ]);
    const scan = await service.scan('ip', '192.0.2.1');
    expect(scan.verdict.level).toBe('malicious');
  });

  it('fails with an AppError when no source can handle the IOC type', async () => {
    const service = serviceWith([stubSource('s', 'hash', async () => cleanReport('s'))]);
    await expect(service.scan('ip', '192.0.2.1')).rejects.toThrow(AppError);
  });
});
