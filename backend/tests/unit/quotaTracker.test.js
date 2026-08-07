import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQuotaTracker } from '../../src/services/quota/quotaTracker.js';

/**
 * Cada test usa su propio directorio temporal para el estado persistido:
 * nunca debe tocarse `backend/data/` real durante la suite.
 */
let dir;
let statePath;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'quota-tracker-test-'));
  statePath = path.join(dir, 'quota-state.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const LIMITS = { abuseipdb: 1000, virustotal: 500 };

/** @param {object} [overrides] */
function makeTracker(overrides = {}) {
  return createQuotaTracker({
    statePath,
    limits: LIMITS,
    now: () => new Date('2026-08-07T12:00:00.000Z'),
    ...overrides,
  });
}

describe('createQuotaTracker: estado inicial', () => {
  it('permite consumir abuseipdb cuando no hay estado persistido', () => {
    expect(makeTracker().canConsume('abuseipdb')).toBe(true);
  });

  it('permite consumir virustotal cuando no hay estado persistido', () => {
    expect(makeTracker().canConsume('virustotal')).toBe(true);
  });

  it('urlhaus siempre puede consumirse, nunca bloquea', () => {
    expect(makeTracker().canConsume('urlhaus')).toBe(true);
  });

  it('getStatus arranca en 0 usos para las tres fuentes', () => {
    const status = makeTracker().getStatus();
    expect(status.map((s) => s.used)).toEqual([0, 0, 0]);
  });

  it('getStatus marca unlimited=true solo en urlhaus', () => {
    const status = makeTracker().getStatus();
    const bySource = Object.fromEntries(status.map((s) => [s.source, s.unlimited]));
    expect(bySource).toEqual({ abuseipdb: false, virustotal: false, urlhaus: true });
  });

  it('getStatus deja limit y remaining en null para urlhaus', () => {
    const status = makeTracker().getStatus();
    const urlhaus = status.find((s) => s.source === 'urlhaus');
    expect(urlhaus.limit).toBeNull();
    expect(urlhaus.remaining).toBeNull();
  });

  it('getStatus expone el limite configurado para abuseipdb y virustotal', () => {
    const status = makeTracker().getStatus();
    const bySource = Object.fromEntries(status.map((s) => [s.source, s.limit]));
    expect(bySource.abuseipdb).toBe(1000);
    expect(bySource.virustotal).toBe(500);
  });
});

describe('createQuotaTracker: recordUsage', () => {
  it('incrementa el contador de usos de la fuente', () => {
    const tracker = makeTracker();
    tracker.recordUsage('virustotal');
    tracker.recordUsage('virustotal');
    const status = tracker.getStatus().find((s) => s.source === 'virustotal');
    expect(status.used).toBe(2);
  });

  it('reduce el remanente de abuseipdb en cada uso', () => {
    const tracker = makeTracker();
    tracker.recordUsage('abuseipdb');
    const status = tracker.getStatus().find((s) => s.source === 'abuseipdb');
    expect(status.remaining).toBe(999);
  });

  it('persiste a disco: un archivo JSON valido existe tras un recordUsage', () => {
    makeTracker().recordUsage('virustotal');
    const raw = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(raw.virustotal.used).toBe(1);
  });

  it('sobrevive a una nueva instancia del tracker sobre el mismo statePath', () => {
    makeTracker().recordUsage('virustotal');
    const second = makeTracker();
    expect(second.getStatus().find((s) => s.source === 'virustotal').used).toBe(1);
  });

  it('nunca bloquea a urlhaus sin importar cuantos usos se registren', () => {
    const tracker = makeTracker();
    for (let i = 0; i < 50; i += 1) tracker.recordUsage('urlhaus');
    expect(tracker.canConsume('urlhaus')).toBe(true);
  });
});

describe('createQuotaTracker: canConsume en el limite', () => {
  it('deja de permitir virustotal cuando used alcanza el limite', () => {
    const tracker = createQuotaTracker({
      statePath,
      limits: { abuseipdb: 1000, virustotal: 2 },
      now: () => new Date('2026-08-07T12:00:00.000Z'),
    });
    tracker.recordUsage('virustotal');
    tracker.recordUsage('virustotal');
    expect(tracker.canConsume('virustotal')).toBe(false);
  });

  it('deja de permitir abuseipdb cuando remaining llega a 0', () => {
    const tracker = createQuotaTracker({
      statePath,
      limits: { abuseipdb: 1, virustotal: 500 },
      now: () => new Date('2026-08-07T12:00:00.000Z'),
    });
    tracker.recordUsage('abuseipdb');
    expect(tracker.canConsume('abuseipdb')).toBe(false);
  });
});

describe('createQuotaTracker: reconcileFromHeaders', () => {
  it('sobreescribe el contador propio con los valores del header', () => {
    const tracker = makeTracker();
    tracker.recordUsage('abuseipdb');
    tracker.recordUsage('abuseipdb');
    tracker.reconcileFromHeaders('abuseipdb', {
      limit: 1000,
      remaining: 950,
      resetAt: '2026-08-08T00:00:00.000Z',
    });
    const status = tracker.getStatus().find((s) => s.source === 'abuseipdb');
    expect(status).toMatchObject({ limit: 1000, remaining: 950, resetAt: '2026-08-08T00:00:00.000Z' });
  });

  it('corrige drift incluso cuando el header reporta mas remanente que el contador propio', () => {
    const tracker = makeTracker();
    tracker.recordUsage('abuseipdb');
    tracker.recordUsage('abuseipdb');
    tracker.recordUsage('abuseipdb');
    tracker.reconcileFromHeaders('abuseipdb', {
      limit: 1000,
      remaining: 998,
      resetAt: '2026-08-08T00:00:00.000Z',
    });
    expect(tracker.canConsume('abuseipdb')).toBe(true);
    expect(tracker.getStatus().find((s) => s.source === 'abuseipdb').remaining).toBe(998);
  });
});

describe('createQuotaTracker: markExhausted', () => {
  it('fuerza remaining a 0 para abuseipdb aunque el contador propio diera margen', () => {
    const tracker = makeTracker();
    tracker.markExhausted('abuseipdb');
    expect(tracker.canConsume('abuseipdb')).toBe(false);
    expect(tracker.getStatus().find((s) => s.source === 'abuseipdb').remaining).toBe(0);
  });

  it('fuerza used a limit para virustotal', () => {
    const tracker = makeTracker();
    tracker.markExhausted('virustotal');
    expect(tracker.canConsume('virustotal')).toBe(false);
    const status = tracker.getStatus().find((s) => s.source === 'virustotal');
    expect(status.used).toBe(status.limit);
  });

  it('no afecta a urlhaus: sigue permitiendo consumo', () => {
    const tracker = makeTracker();
    tracker.markExhausted('urlhaus');
    expect(tracker.canConsume('urlhaus')).toBe(true);
  });
});

describe('createQuotaTracker: reset por cambio de fecha UTC', () => {
  it('resetea used a 0 al cambiar la fecha UTC persistida', () => {
    const day1 = makeTracker({ now: () => new Date('2026-08-07T23:59:00.000Z') });
    day1.recordUsage('virustotal');
    day1.recordUsage('virustotal');

    const day2 = makeTracker({ now: () => new Date('2026-08-08T00:05:00.000Z') });
    expect(day2.getStatus().find((s) => s.source === 'virustotal').used).toBe(0);
  });

  it('resetea el remanente de abuseipdb al maximo configurado al cambiar de dia', () => {
    const day1 = makeTracker({ now: () => new Date('2026-08-07T23:59:00.000Z') });
    day1.markExhausted('abuseipdb');
    expect(day1.canConsume('abuseipdb')).toBe(false);

    const day2 = makeTracker({ now: () => new Date('2026-08-08T00:05:00.000Z') });
    expect(day2.canConsume('abuseipdb')).toBe(true);
    expect(day2.getStatus().find((s) => s.source === 'abuseipdb').remaining).toBe(1000);
  });

  it('no resetea si la fecha UTC persistida sigue siendo hoy', () => {
    const morning = makeTracker({ now: () => new Date('2026-08-07T01:00:00.000Z') });
    morning.recordUsage('virustotal');

    const evening = makeTracker({ now: () => new Date('2026-08-07T23:00:00.000Z') });
    expect(evening.getStatus().find((s) => s.source === 'virustotal').used).toBe(1);
  });
});
