/**
 * Respuestas simuladas de VirusTotal, con la forma cruda de su API v3
 * (`GET /api/v3/files/{id}`): conteos de deteccion por engine, no un score.
 */

import { bucketFor } from './fixtureBucket.js';

const SCENARIOS = {
  clean: {
    stats: { malicious: 0, suspicious: 0, harmless: 62, undetected: 11, timeout: 0 },
    meaningful_name: 'informe-trimestral.pdf',
    type_description: 'PDF document',
    // Archivo limpio: VirusTotal no arma clasificacion de amenaza.
    popular_threat_classification: undefined,
  },
  suspicious: {
    stats: { malicious: 2, suspicious: 1, harmless: 55, undetected: 15, timeout: 0 },
    meaningful_name: 'instalador.exe',
    type_description: 'Win32 EXE',
    // Pocas detecciones heuristicas: clasificacion de baja confianza.
    popular_threat_classification: {
      popular_threat_category: [{ value: 'adware', count: 2 }],
      suggested_threat_label: 'adware.generic',
      popular_threat_name: [{ value: 'genericadware', count: 2 }],
    },
  },
  malicious: {
    stats: { malicious: 51, suspicious: 4, harmless: 3, undetected: 15, timeout: 0 },
    meaningful_name: 'factura.pdf.exe',
    type_description: 'Win32 EXE',
    // Familia de malware conocida y ampliamente detectada.
    popular_threat_classification: {
      popular_threat_category: [{ value: 'trojan', count: 45 }],
      suggested_threat_label: 'trojan.emotet/heodo',
      popular_threat_name: [
        { value: 'emotet', count: 30 },
        { value: 'heodo', count: 20 },
      ],
    },
  },
};

/**
 * @param {{ value: string, algorithm: string }} ioc
 * @returns {object} Payload crudo tipo VirusTotal.
 */
export function virustotalMockResponse(ioc) {
  const scenario = SCENARIOS[bucketFor(ioc.value)];
  return {
    data: {
      id: ioc.value,
      type: 'file',
      attributes: {
        last_analysis_stats: { ...scenario.stats },
        meaningful_name: scenario.meaningful_name,
        type_description: scenario.type_description,
        last_analysis_date: 1_785_000_000,
        popular_threat_classification: scenario.popular_threat_classification,
      },
    },
  };
}
