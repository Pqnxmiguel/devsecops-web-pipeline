/**
 * Respuestas simuladas de AbuseIPDB, con la forma cruda de su API v2
 * (`GET /api/v2/check`).
 */

import { bucketFor } from './fixtureBucket.js';

const SCENARIOS = {
  clean: {
    abuseConfidenceScore: 0,
    totalReports: 0,
    countryCode: 'CH',
    isp: 'Example Telecom',
    usageType: 'Fixed Line ISP',
    domain: 'example-residential-isp.ch',
    reports: [],
  },
  suspicious: {
    abuseConfidenceScore: 43,
    totalReports: 12,
    countryCode: 'RU',
    isp: 'Example Hosting LLC',
    usageType: 'Data Center/Web Hosting/Transit',
    domain: 'example-hosting.ru',
    // Categorias 14 (Port Scan) y 19 (Bad Web Bot): actividad ruidosa pero
    // leve, coherente con un veredicto "suspicious".
    reports: [
      { categories: [14] },
      { categories: [14, 19] },
    ],
  },
  malicious: {
    abuseConfidenceScore: 96,
    totalReports: 428,
    countryCode: 'CN',
    isp: 'Example Bulletproof Hosting',
    usageType: 'Data Center/Web Hosting/Transit',
    domain: 'example-bulletproof-hosting.cn',
    // Categorias 22 (SSH), 18 (Brute-Force), 21 (Web App Attack): patron
    // tipico de infraestructura de ataque activa.
    reports: [
      { categories: [22, 18] },
      { categories: [22, 21] },
      { categories: [18, 21, 15] },
    ],
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
