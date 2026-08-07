import { describe, it, expect } from 'vitest';
import { normalizeAbuseipdb } from '../../src/services/sources/abuseipdb.js';
import { normalizeVirustotal } from '../../src/services/sources/virustotal.js';
import { normalizeUrlhaus } from '../../src/services/sources/urlhaus.js';
import { SourceError } from '../../src/utils/errors.js';

/** Construye un payload de AbuseIPDB con la forma real de su API v2. */
function abusePayload(abuseConfidenceScore, totalReports = 0) {
  return {
    data: {
      ipAddress: '1.2.3.4',
      abuseConfidenceScore,
      totalReports,
      countryCode: 'US',
      isp: 'Example ISP',
    },
  };
}

/** Construye un payload de VirusTotal con la forma real de su API v3. */
function vtPayload({ malicious = 0, suspicious = 0, harmless = 60, undetected = 10 }) {
  return {
    data: {
      attributes: {
        last_analysis_stats: { malicious, suspicious, harmless, undetected, timeout: 0 },
        meaningful_name: 'sample.bin',
      },
    },
  };
}

describe('normalizeAbuseipdb', () => {
  it('maps a score of 0 with no reports to clean', () => {
    expect(normalizeAbuseipdb(abusePayload(0, 0)).level).toBe('clean');
  });

  it('gives low confidence when nobody has ever reported the address', () => {
    expect(normalizeAbuseipdb(abusePayload(0, 0)).confidence).toBe(0.3);
  });

  it('gives normal confidence to a low score backed by real reports', () => {
    expect(normalizeAbuseipdb(abusePayload(10, 5)).confidence).toBe(0.7);
  });

  it('maps the 25 threshold to suspicious', () => {
    expect(normalizeAbuseipdb(abusePayload(25, 4)).level).toBe('suspicious');
  });

  it('maps the 75 threshold to malicious', () => {
    expect(normalizeAbuseipdb(abusePayload(75, 40)).level).toBe('malicious');
  });

  it('carries the upstream confidence score through as the common score', () => {
    expect(normalizeAbuseipdb(abusePayload(93, 120)).score).toBe(93);
  });

  it('summarises the report count in details', () => {
    expect(normalizeAbuseipdb(abusePayload(93, 120)).details).toMatchObject({
      totalReports: 120,
      countryCode: 'US',
    });
  });

  it('throws a bad_response SourceError when the payload has no data', () => {
    expect(() => normalizeAbuseipdb({})).toThrow(SourceError);
  });

  it('throws when abuseConfidenceScore is not a number', () => {
    expect(() => normalizeAbuseipdb({ data: { abuseConfidenceScore: 'high' } })).toThrow(
      SourceError,
    );
  });
});

describe('normalizeAbuseipdb narrative fields', () => {
  it('extracts usageType and domain when present', () => {
    const report = normalizeAbuseipdb({
      data: {
        abuseConfidenceScore: 0,
        totalReports: 0,
        usageType: 'Fixed Line ISP',
        domain: 'example-isp.net',
      },
    });
    expect(report.details).toMatchObject({
      usageType: 'Fixed Line ISP',
      domain: 'example-isp.net',
    });
  });

  it('falls back to null for usageType and domain when absent', () => {
    const report = normalizeAbuseipdb({ data: { abuseConfidenceScore: 0, totalReports: 0 } });
    expect(report.details.usageType).toBeNull();
    expect(report.details.domain).toBeNull();
  });

  it('translates numeric report categories into readable labels, deduplicated', () => {
    const report = normalizeAbuseipdb({
      data: {
        abuseConfidenceScore: 96,
        totalReports: 3,
        reports: [
          { categories: [18, 22] },
          { categories: [22, 15] },
        ],
      },
    });
    expect(report.details.categories.sort()).toEqual(
      ['Brute-Force', 'Hacking', 'SSH'].sort(),
    );
  });

  it('falls back to a generic label for an unlisted category code without throwing', () => {
    const report = normalizeAbuseipdb({
      data: { abuseConfidenceScore: 50, totalReports: 1, reports: [{ categories: [99] }] },
    });
    expect(report.details.categories).toEqual(['Categoría 99']);
  });

  it('defaults categories to an empty array when reports is missing', () => {
    const report = normalizeAbuseipdb({ data: { abuseConfidenceScore: 0, totalReports: 0 } });
    expect(report.details.categories).toEqual([]);
  });
});

describe('normalizeVirustotal', () => {
  it('maps zero detections across many engines to clean', () => {
    expect(normalizeVirustotal(vtPayload({})).level).toBe('clean');
  });

  it('gives higher confidence to a clean result from many engines', () => {
    expect(normalizeVirustotal(vtPayload({})).confidence).toBe(0.6);
  });

  it('gives lower confidence to a clean result from few engines', () => {
    expect(
      normalizeVirustotal(vtPayload({ harmless: 5, undetected: 5 })).confidence,
    ).toBe(0.3);
  });

  it('treats a single detection as suspicious, not malicious', () => {
    expect(normalizeVirustotal(vtPayload({ malicious: 1 })).level).toBe('suspicious');
  });

  it('treats two detections as suspicious', () => {
    expect(normalizeVirustotal(vtPayload({ malicious: 2 })).level).toBe('suspicious');
  });

  it('treats three detections as malicious', () => {
    expect(normalizeVirustotal(vtPayload({ malicious: 3 })).level).toBe('malicious');
  });

  it('counts suspicious engines as half a detection towards the threshold', () => {
    expect(normalizeVirustotal(vtPayload({ malicious: 0, suspicious: 2 })).level).toBe(
      'suspicious',
    );
  });

  it('keeps the score inside the band implied by the detection count', () => {
    expect(
      normalizeVirustotal(vtPayload({ malicious: 5 })).score,
    ).toBeGreaterThanOrEqual(75);
  });

  it('caps the amplified score at 100', () => {
    expect(
      normalizeVirustotal(vtPayload({ malicious: 60, harmless: 0, undetected: 0 }))
        .score,
    ).toBe(100);
  });

  it('exposes the raw engine counts in details', () => {
    expect(normalizeVirustotal(vtPayload({ malicious: 3 })).details).toMatchObject({
      malicious: 3,
      totalEngines: 73,
    });
  });

  it('throws a bad_response SourceError when last_analysis_stats is missing', () => {
    expect(() => normalizeVirustotal({ data: { attributes: {} } })).toThrow(SourceError);
  });

  it('throws when no engine reported at all, since the ratio is undefined', () => {
    expect(() =>
      normalizeVirustotal(
        vtPayload({ malicious: 0, suspicious: 0, harmless: 0, undetected: 0 }),
      ),
    ).toThrow(SourceError);
  });
});

describe('normalizeVirustotal narrative fields', () => {
  function vtPayloadWithClassification(classification) {
    return {
      data: {
        attributes: {
          last_analysis_stats: { malicious: 51, suspicious: 4, harmless: 3, undetected: 15 },
          popular_threat_classification: classification,
        },
      },
    };
  }

  it('extracts threatCategory and threatLabel when present', () => {
    const report = normalizeVirustotal(
      vtPayloadWithClassification({
        popular_threat_category: [{ value: 'trojan', count: 30 }],
        suggested_threat_label: 'trojan.emotet/heodo',
      }),
    );
    expect(report.details.threatCategory).toBe('trojan');
    expect(report.details.threatLabel).toBe('trojan.emotet/heodo');
  });

  it('falls back to null for threatCategory and threatLabel when classification is absent', () => {
    const report = normalizeVirustotal(vtPayloadWithClassification(undefined));
    expect(report.details.threatCategory).toBeNull();
    expect(report.details.threatLabel).toBeNull();
  });

  it('extracts and deduplicates threatNames', () => {
    const report = normalizeVirustotal(
      vtPayloadWithClassification({
        popular_threat_name: [
          { value: 'emotet', count: 20 },
          { value: 'heodo', count: 10 },
          { value: 'emotet', count: 5 },
        ],
      }),
    );
    expect(report.details.threatNames.sort()).toEqual(['emotet', 'heodo'].sort());
  });

  it('defaults threatNames to an empty array when classification is absent', () => {
    const report = normalizeVirustotal(vtPayloadWithClassification(undefined));
    expect(report.details.threatNames).toEqual([]);
  });
});

describe('normalizeUrlhaus', () => {
  it('maps no_results to clean', () => {
    expect(normalizeUrlhaus({ query_status: 'no_results' }).level).toBe('clean');
  });

  it('gives only moderate confidence to an absence of listing', () => {
    expect(normalizeUrlhaus({ query_status: 'no_results' }).confidence).toBe(0.5);
  });

  it('maps a listed host whose urls are all offline to suspicious', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }, { url_status: 'offline' }],
    });
    expect(report.level).toBe('suspicious');
  });

  it('maps a listed host with an online url to malicious', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }, { url_status: 'online' }],
    });
    expect(report.level).toBe('malicious');
  });

  it('scores a blacklisted host at the top of the scale', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }],
      blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'not listed' },
    });
    expect(report.score).toBe(100);
  });

  it('counts the online and offline urls in details', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'online' }, { url_status: 'offline' }],
    });
    expect(report.details).toMatchObject({ onlineUrls: 1, totalUrls: 2 });
  });

  it('throws a bad_response SourceError when query_status is missing', () => {
    expect(() => normalizeUrlhaus({})).toThrow(SourceError);
  });

  it('throws when the query status is one the client cannot interpret', () => {
    expect(() => normalizeUrlhaus({ query_status: 'invalid_host' })).toThrow(SourceError);
  });
});

describe('normalizeUrlhaus narrative fields', () => {
  it('unions and deduplicates tags across all urls', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [
        { url_status: 'online', tags: ['elf', 'mirai'] },
        { url_status: 'offline', tags: ['mirai', 'botnet'] },
      ],
    });
    expect(report.details.tags.sort()).toEqual(['botnet', 'elf', 'mirai'].sort());
  });

  it('defaults tags to an empty array when no urls carry tags', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }],
    });
    expect(report.details.tags).toEqual([]);
  });

  it('defaults tags to an empty array for no_results', () => {
    expect(normalizeUrlhaus({ query_status: 'no_results' }).details.tags).toEqual([]);
  });

  it('takes threatType from the first url that has one', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }, { url_status: 'online', threat: 'malware_download' }],
    });
    expect(report.details.threatType).toBe('malware_download');
  });

  it('falls back to null threatType when no url has one', () => {
    const report = normalizeUrlhaus({
      query_status: 'ok',
      urls: [{ url_status: 'offline' }],
    });
    expect(report.details.threatType).toBeNull();
  });

  it('falls back to null threatType for no_results', () => {
    expect(normalizeUrlhaus({ query_status: 'no_results' }).details.threatType).toBeNull();
  });
});
