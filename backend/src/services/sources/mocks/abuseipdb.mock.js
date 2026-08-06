/**
 * Respuestas simuladas de AbuseIPDB, con la forma cruda de su API v2
 * (`GET /api/v2/check`).
 */

import { bucketFor } from './fixtureBucket.js';

const SCENARIOS = {
  clean: { abuseConfidenceScore: 0, totalReports: 0, countryCode: 'CH', isp: 'Example Telecom' },
  suspicious: {
    abuseConfidenceScore: 43,
    totalReports: 12,
    countryCode: 'RU',
    isp: 'Example Hosting LLC',
  },
  malicious: {
    abuseConfidenceScore: 96,
    totalReports: 428,
    countryCode: 'CN',
    isp: 'Example Bulletproof Hosting',
  },
};

/**
 * @param {{ value: string }} ioc
 * @returns {object} Payload crudo tipo AbuseIPDB.
 */
export function abuseipdbMockResponse(ioc) {
  const scenario = SCENARIOS[bucketFor(ioc.value)];
  return {
    data: {
      ipAddress: ioc.value,
      isPublic: true,
      ipVersion: ioc.ipVersion ?? 4,
      lastReportedAt: scenario.totalReports > 0 ? '2026-07-30T11:02:41+00:00' : null,
      ...scenario,
    },
  };
}
