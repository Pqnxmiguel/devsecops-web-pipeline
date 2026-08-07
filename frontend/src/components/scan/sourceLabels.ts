/**
 * Etiquetas legibles por fuente externa. Único dueño de este mapeo — antes
 * vivía sólo en `SourceReportCard.tsx`; se extrae acá porque `QuotaMessage.tsx`
 * y el footer de `VerdictMessage.tsx` (vía `lib/quotaPresentation.ts`)
 * también lo necesitan y no hay que duplicarlo.
 */
export const SOURCE_LABEL: Record<string, string> = {
  abuseipdb: 'AbuseIPDB',
  virustotal: 'VirusTotal',
  urlhaus: 'URLhaus',
};
