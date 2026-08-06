import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryHistoryRepository } from '../../src/models/historyRepository.js';

/** @param {number} n */
function scanFixture(n) {
  return {
    id: `scan-${n}`,
    ioc: { type: 'ip', value: `192.0.2.${n}`, ipVersion: 4 },
    verdict: { level: 'clean', score: 0, confidence: 0.3, summary: 'ok' },
    sources: [],
    scannedAt: new Date(2026, 0, 1, 0, 0, n).toISOString(),
    mock: true,
  };
}

describe('createInMemoryHistoryRepository', () => {
  let repository;

  beforeEach(() => {
    repository = createInMemoryHistoryRepository({ maxEntries: 5 });
  });

  it('starts empty', () => {
    expect(repository.count()).toBe(0);
  });

  it('returns a stored scan', () => {
    repository.add(scanFixture(1));
    expect(repository.list({ limit: 10, offset: 0 }).items).toEqual([scanFixture(1)]);
  });

  it('returns the most recent scan first', () => {
    repository.add(scanFixture(1));
    repository.add(scanFixture(2));
    expect(repository.list({ limit: 10, offset: 0 }).items.map((s) => s.id)).toEqual([
      'scan-2',
      'scan-1',
    ]);
  });

  it('reports the total independently of the page size', () => {
    for (let i = 1; i <= 4; i += 1) repository.add(scanFixture(i));
    expect(repository.list({ limit: 2, offset: 0 }).total).toBe(4);
  });

  it('honours the page size', () => {
    for (let i = 1; i <= 4; i += 1) repository.add(scanFixture(i));
    expect(repository.list({ limit: 2, offset: 0 }).items.map((s) => s.id)).toEqual([
      'scan-4',
      'scan-3',
    ]);
  });

  it('honours the offset', () => {
    for (let i = 1; i <= 4; i += 1) repository.add(scanFixture(i));
    expect(repository.list({ limit: 2, offset: 2 }).items.map((s) => s.id)).toEqual([
      'scan-2',
      'scan-1',
    ]);
  });

  it('returns an empty page when the offset is past the end', () => {
    repository.add(scanFixture(1));
    expect(repository.list({ limit: 10, offset: 50 }).items).toEqual([]);
  });

  it('drops the oldest entry once the cap is reached', () => {
    for (let i = 1; i <= 6; i += 1) repository.add(scanFixture(i));
    const ids = repository.list({ limit: 10, offset: 0 }).items.map((s) => s.id);
    expect(ids).not.toContain('scan-1');
  });

  it('never grows past the configured cap', () => {
    for (let i = 1; i <= 50; i += 1) repository.add(scanFixture(i));
    expect(repository.count()).toBe(5);
  });

  it('returns the stored scan itself, not a live reference a caller can mutate', () => {
    repository.add(scanFixture(1));
    const [item] = repository.list({ limit: 10, offset: 0 }).items;
    expect(() => {
      item.verdict = 'tampered';
    }).toThrow();
  });

  it('empties on clear', () => {
    repository.add(scanFixture(1));
    repository.clear();
    expect(repository.count()).toBe(0);
  });

  it('rejects a non-positive cap at construction time', () => {
    expect(() => createInMemoryHistoryRepository({ maxEntries: 0 })).toThrow();
  });
});
