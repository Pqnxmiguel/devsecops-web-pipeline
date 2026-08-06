import { describe, expect, it } from 'vitest';
import { enrichedDetailRows, narrativeIntroFor } from './verdictPresentation';
import type { SourceReport } from './types';

function report(overrides: Partial<SourceReport> = {}): SourceReport {
  return {
    source: 'abuseipdb',
    level: 'clean',
    score: 10,
    confidence: 0.5,
    details: {},
    degraded: false,
    ...overrides,
  };
}

describe('enrichedDetailRows', () => {
  it('returns an empty list when the enriched fields are absent (backend has not shipped them yet)', () => {
    const rows = enrichedDetailRows(report({ details: { abuseConfidenceScore: 10, totalReports: 0 } }));
    expect(rows).toEqual([]);
  });

  it('returns an empty list when enriched fields are explicitly null or empty arrays — never "undefined"', () => {
    const rows = enrichedDetailRows(
      report({ details: { categories: [], usageType: null, domain: null } }),
    );
    expect(rows).toEqual([]);
  });

  it('surfaces IP enrichment (categories/usageType/domain) when present', () => {
    const rows = enrichedDetailRows(
      report({
        source: 'abuseipdb',
        details: { categories: [4, 20], usageType: 'Data Center/Web Hosting/Transit', domain: 'example.net' },
      }),
    );
    expect(rows).toEqual([
      { label: 'Categorías', value: '4, 20' },
      { label: 'Tipo de uso', value: 'Data Center/Web Hosting/Transit' },
      { label: 'Dominio asociado', value: 'example.net' },
    ]);
  });

  it('surfaces hash enrichment (threatCategory/threatLabel/threatNames) when present', () => {
    const rows = enrichedDetailRows(
      report({
        source: 'virustotal',
        details: { threatCategory: 'trojan', threatLabel: 'Trojan.Generic', threatNames: ['Emotet', 'Heodo'] },
      }),
    );
    expect(rows).toEqual([
      { label: 'Categoría de amenaza', value: 'trojan' },
      { label: 'Etiqueta', value: 'Trojan.Generic' },
      { label: 'Nombres de amenaza', value: 'Emotet, Heodo' },
    ]);
  });

  it('surfaces domain enrichment (tags/threatType) when present', () => {
    const rows = enrichedDetailRows(
      report({ source: 'urlhaus', details: { tags: ['php', 'webshell'], threatType: 'malware_download' } }),
    );
    expect(rows).toEqual([
      { label: 'Tags', value: 'php, webshell' },
      { label: 'Tipo de amenaza', value: 'malware_download' },
    ]);
  });

  it('never crashes on an unknown source id — just no enrichment rows', () => {
    expect(() => enrichedDetailRows(report({ source: 'some-future-source' }))).not.toThrow();
    expect(enrichedDetailRows(report({ source: 'some-future-source' }))).toEqual([]);
  });
});

describe('narrativeIntroFor', () => {
  it('produces a distinct sentence for each of the 4 levels', () => {
    const sentences = new Set(
      (['clean', 'suspicious', 'malicious', 'unknown'] as const).map((level) => narrativeIntroFor(level, 'x')),
    );
    expect(sentences.size).toBe(4);
  });

  it('never phrases unknown as reassuring/clean language', () => {
    const text = narrativeIntroFor('unknown', '198.51.100.1').toLowerCase();
    expect(text).not.toContain('no encontré nada');
  });
});
