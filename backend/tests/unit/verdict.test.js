import { describe, it, expect } from 'vitest';
import {
  levelForScore,
  clampScoreToLevel,
  createSourceReport,
  degradedSourceReport,
  aggregateVerdict,
} from '../../src/models/verdict.js';

describe('levelForScore', () => {
  it('maps 0 to clean', () => {
    expect(levelForScore(0)).toBe('clean');
  });

  it('maps the top of the clean band to clean', () => {
    expect(levelForScore(24)).toBe('clean');
  });

  it('maps the bottom of the suspicious band to suspicious', () => {
    expect(levelForScore(25)).toBe('suspicious');
  });

  it('maps the top of the suspicious band to suspicious', () => {
    expect(levelForScore(74)).toBe('suspicious');
  });

  it('maps the bottom of the malicious band to malicious', () => {
    expect(levelForScore(75)).toBe('malicious');
  });

  it('maps 100 to malicious', () => {
    expect(levelForScore(100)).toBe('malicious');
  });
});

describe('clampScoreToLevel', () => {
  it('raises a score below its band up to the band floor', () => {
    expect(clampScoreToLevel(34, 'malicious')).toBe(75);
  });

  it('raises a suspicious score below 25 up to 25', () => {
    expect(clampScoreToLevel(11, 'suspicious')).toBe(25);
  });

  it('lowers a clean score above the band ceiling down to 24', () => {
    expect(clampScoreToLevel(90, 'clean')).toBe(24);
  });

  it('leaves a score already inside its band untouched', () => {
    expect(clampScoreToLevel(80, 'malicious')).toBe(80);
  });
});

describe('createSourceReport', () => {
  it('derives the score from the level band when they disagree', () => {
    const report = createSourceReport({
      source: 'virustotal',
      level: 'malicious',
      score: 34,
      confidence: 0.9,
      details: { malicious: 3 },
    });
    expect(report.score).toBe(75);
  });

  it('marks a normal report as not degraded', () => {
    const report = createSourceReport({
      source: 'urlhaus',
      level: 'clean',
      score: 0,
      confidence: 0.5,
    });
    expect(report.degraded).toBe(false);
  });

  it('stamps an ISO-8601 query timestamp', () => {
    const report = createSourceReport({
      source: 'urlhaus',
      level: 'clean',
      score: 0,
      confidence: 0.5,
    });
    expect(new Date(report.queriedAt).toISOString()).toBe(report.queriedAt);
  });
});

describe('degradedSourceReport', () => {
  it('produces a zero-confidence clean report flagged as degraded', () => {
    const report = degradedSourceReport('abuseipdb', 'timeout');
    expect(report).toMatchObject({
      source: 'abuseipdb',
      level: 'clean',
      score: 0,
      confidence: 0,
      degraded: true,
    });
  });

  it('records the failure reason without leaking internal detail', () => {
    expect(degradedSourceReport('abuseipdb', 'timeout').details).toEqual({
      reason: 'timeout',
    });
  });
});

describe('aggregateVerdict', () => {
  it('takes the highest score rather than the average', () => {
    const verdict = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'clean', score: 0, confidence: 0.5 }),
      createSourceReport({
        source: 'b',
        level: 'malicious',
        score: 90,
        confidence: 0.9,
      }),
    ]);
    expect(verdict.score).toBe(90);
  });

  it('derives the level from the aggregated score', () => {
    const verdict = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'clean', score: 0, confidence: 0.5 }),
      createSourceReport({
        source: 'b',
        level: 'malicious',
        score: 90,
        confidence: 0.9,
      }),
    ]);
    expect(verdict.level).toBe('malicious');
  });

  it('scales confidence down when only some sources answered', () => {
    const verdict = aggregateVerdict([
      createSourceReport({
        source: 'a',
        level: 'malicious',
        score: 90,
        confidence: 0.9,
      }),
      degradedSourceReport('b', 'timeout'),
    ]);
    expect(verdict.confidence).toBe(0.45);
  });

  it('reports zero confidence when every source is degraded', () => {
    const verdict = aggregateVerdict([
      degradedSourceReport('a', 'timeout'),
      degradedSourceReport('b', 'unavailable'),
    ]);
    expect(verdict).toMatchObject({ level: 'clean', score: 0, confidence: 0 });
  });

  it('says so in the summary when nothing answered', () => {
    const verdict = aggregateVerdict([degradedSourceReport('a', 'timeout')]);
    expect(verdict.summary).toMatch(/ninguna fuente/i);
  });

  it('counts the agreeing sources in the summary', () => {
    const verdict = aggregateVerdict([
      createSourceReport({
        source: 'a',
        level: 'malicious',
        score: 90,
        confidence: 0.9,
      }),
    ]);
    expect(verdict.summary).toMatch(/1 de 1/);
  });

  it('rejects an empty report list because a verdict needs evidence', () => {
    expect(() => aggregateVerdict([])).toThrow();
  });
});
