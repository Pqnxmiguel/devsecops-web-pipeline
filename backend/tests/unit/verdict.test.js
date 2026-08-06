import { describe, it, expect } from 'vitest';
import {
  levelForScore,
  clampScoreToLevel,
  createSourceReport,
  degradedSourceReport,
  aggregateVerdict,
  isConclusiveReport,
  SCORED_LEVELS,
  VERDICT_LEVELS,
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

  // Sin la guarda, `null >= 25` es false y la funcion devolvia 'clean': un
  // score ausente se convertia en un veredicto limpio.
  it('throws instead of calling a null score clean', () => {
    expect(() => levelForScore(null)).toThrow(TypeError);
  });

  it('throws instead of calling an undefined score clean', () => {
    expect(() => levelForScore(undefined)).toThrow(TypeError);
  });

  it('throws on NaN', () => {
    expect(() => levelForScore(Number.NaN)).toThrow(TypeError);
  });
});

describe('level enum', () => {
  it('includes unknown as a fourth verdict level', () => {
    expect(VERDICT_LEVELS).toContain('unknown');
  });

  it('keeps unknown out of the numeric scale', () => {
    expect(SCORED_LEVELS).not.toContain('unknown');
  });

  it('exposes exactly the four documented levels', () => {
    expect([...VERDICT_LEVELS]).toEqual(['clean', 'suspicious', 'malicious', 'unknown']);
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

  it('refuses to invent a band for unknown', () => {
    expect(() => clampScoreToLevel(0, 'unknown')).toThrow(TypeError);
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

  // Un reporte `unknown` NO degradado contaria como fuente que respondio y
  // volveria a abrir el agujero por otro lado.
  it('refuses to build an unknown report for a source that answered', () => {
    expect(() =>
      createSourceReport({ source: 'a', level: 'unknown', score: 0, confidence: 0 }),
    ).toThrow(TypeError);
  });
});

describe('degradedSourceReport', () => {
  it('produces an unknown report flagged as degraded, never a clean one', () => {
    const report = degradedSourceReport('abuseipdb', 'timeout');
    expect(report).toMatchObject({
      source: 'abuseipdb',
      level: 'unknown',
      score: null,
      confidence: 0,
      degraded: true,
    });
  });

  it('carries no score at all, so nothing can sort it as the least malicious', () => {
    expect(degradedSourceReport('abuseipdb', 'timeout').score).toBeNull();
  });

  it('records the failure reason without leaking internal detail', () => {
    expect(degradedSourceReport('abuseipdb', 'timeout').details).toEqual({
      reason: 'timeout',
    });
  });
});

describe('isConclusiveReport', () => {
  it('accepts a report from a source that answered', () => {
    const report = createSourceReport({
      source: 'a',
      level: 'clean',
      score: 0,
      confidence: 0.5,
    });
    expect(isConclusiveReport(report)).toBe(true);
  });

  it('rejects a degraded report', () => {
    expect(isConclusiveReport(degradedSourceReport('a', 'timeout'))).toBe(false);
  });

  // Defensa en profundidad: aunque alguien reintroduzca `degraded: false` en un
  // reporte de relleno, el nivel fuera de la escala sigue excluyendolo.
  it('rejects an unknown-level report even if it claims not to be degraded', () => {
    const forged = { source: 'a', level: 'unknown', score: null, confidence: 0, degraded: false };
    expect(isConclusiveReport(forged)).toBe(false);
  });

  it('rejects a scored level with a null score', () => {
    const forged = { source: 'a', level: 'clean', score: null, confidence: 0, degraded: false };
    expect(isConclusiveReport(forged)).toBe(false);
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

  it('returns unknown -- not clean -- when every source is degraded', () => {
    const verdict = aggregateVerdict([
      degradedSourceReport('a', 'timeout'),
      degradedSourceReport('b', 'unavailable'),
    ]);
    expect(verdict).toMatchObject({ level: 'unknown', score: null, confidence: 0 });
  });

  it('returns unknown when the single configured source is rate limited', () => {
    // El escenario real: cuota diaria de AbuseIPDB agotada -> 429 en cada
    // consulta del resto del dia.
    const verdict = aggregateVerdict([degradedSourceReport('abuseipdb', 'rate_limit')]);
    expect(verdict.level).toBe('unknown');
  });

  it('says so in the summary when nothing answered', () => {
    const verdict = aggregateVerdict([degradedSourceReport('a', 'timeout')]);
    expect(verdict.summary).toMatch(/ninguna fuente/i);
  });

  it('spells out in the summary that unknown is not a clean bill of health', () => {
    const verdict = aggregateVerdict([degradedSourceReport('a', 'timeout')]);
    expect(verdict.summary).toMatch(/no significa que sea limpio/i);
  });

  it('keeps the verdict of the source that answered when a sibling degrades', () => {
    const verdict = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'malicious', score: 90, confidence: 0.9 }),
      degradedSourceReport('b', 'timeout'),
    ]);
    expect(verdict).toMatchObject({ level: 'malicious', score: 90 });
  });

  it('lowers confidence when a sibling degrades but keeps the level', () => {
    const both = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'clean', score: 0, confidence: 0.8 }),
      createSourceReport({ source: 'b', level: 'clean', score: 0, confidence: 0.8 }),
    ]);
    const one = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'clean', score: 0, confidence: 0.8 }),
      degradedSourceReport('b', 'timeout'),
    ]);
    expect(one.level).toBe(both.level);
    expect(one.confidence).toBeLessThan(both.confidence);
  });

  it('does not let a degraded source drag a clean verdict down or up', () => {
    const alone = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'suspicious', score: 60, confidence: 0.7 }),
    ]);
    const withDegraded = aggregateVerdict([
      createSourceReport({ source: 'a', level: 'suspicious', score: 60, confidence: 0.7 }),
      degradedSourceReport('b', 'unavailable'),
    ]);
    expect(withDegraded.score).toBe(alone.score);
    expect(withDegraded.level).toBe(alone.level);
  });

  /**
   * Guarda anti-regresion del fail-open (CWE-636, OBS-2).
   *
   * Enumera TODAS las combinaciones de reportes degradados / no degradados
   * hasta tres fuentes y exige la implicacion en las dos direcciones:
   *
   *   verdict.level === 'clean'  =>  al menos un reporte concluyente
   *   ningun reporte concluyente =>  verdict.level === 'unknown' y score null
   *
   * Si alguien vuelve a devolver `clean/0` cuando todo esta degradado, este
   * test falla en la primera combinacion sin fuentes vivas.
   */
  it('never yields clean unless at least one source actually answered', () => {
    const live = (id) =>
      createSourceReport({ source: id, level: 'clean', score: 0, confidence: 0.5 });
    const dead = (id) => degradedSourceReport(id, 'timeout');

    for (let size = 1; size <= 3; size += 1) {
      // Cada bit del contador decide si la fuente i respondio o se degrado.
      for (let mask = 0; mask < 2 ** size; mask += 1) {
        const reports = Array.from({ length: size }, (_unused, i) =>
          (mask >> i) & 1 ? live(`s${i}`) : dead(`s${i}`),
        );
        const anyAnswered = reports.some((report) => report.degraded === false);
        const verdict = aggregateVerdict(reports);

        if (verdict.level === 'clean') {
          expect(anyAnswered, `clean sin fuentes vivas (size=${size}, mask=${mask})`).toBe(true);
        }
        if (!anyAnswered) {
          expect(verdict.level, `size=${size}, mask=${mask}`).toBe('unknown');
          expect(verdict.score, `size=${size}, mask=${mask}`).toBeNull();
          expect(verdict.confidence, `size=${size}, mask=${mask}`).toBe(0);
        }
      }
    }
  });

  it('never yields a numeric score without a source that answered', () => {
    const verdict = aggregateVerdict([
      degradedSourceReport('a', 'rate_limit'),
      degradedSourceReport('b', 'timeout'),
      degradedSourceReport('c', 'bad_response'),
    ]);
    expect(typeof verdict.score).not.toBe('number');
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
