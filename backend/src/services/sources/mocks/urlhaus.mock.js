/**
 * Respuestas simuladas de URLhaus (abuse.ch), con la forma cruda de su Host API
 * (`POST /v1/host/`): estado de listado, no un score.
 */

import { bucketFor } from './fixtureBucket.js';

const NOT_LISTED = { spamhaus_dbl: 'not listed', surbl: 'not listed' };

/**
 * @param {{ value: string }} ioc
 * @returns {object} Payload crudo tipo URLhaus.
 */
export function urlhausMockResponse(ioc) {
  const bucket = bucketFor(ioc.value);

  if (bucket === 'clean') {
    return { query_status: 'no_results' };
  }

  if (bucket === 'suspicious') {
    return {
      query_status: 'ok',
      host: ioc.value,
      firstseen: '2026-02-11 08:14:03',
      url_count: '2',
      blacklists: { ...NOT_LISTED },
      urls: [
        { id: '3310021', url_status: 'offline', threat: 'malware_download' },
        { id: '3310044', url_status: 'offline', threat: 'malware_download' },
      ],
    };
  }

  return {
    query_status: 'ok',
    host: ioc.value,
    firstseen: '2026-06-02 19:47:55',
    url_count: '3',
    blacklists: { spamhaus_dbl: 'abused_legit_malware', surbl: 'listed' },
    urls: [
      { id: '3410088', url_status: 'online', threat: 'malware_download' },
      { id: '3410090', url_status: 'online', threat: 'malware_download' },
      { id: '3410091', url_status: 'offline', threat: 'malware_download' },
    ],
  };
}
