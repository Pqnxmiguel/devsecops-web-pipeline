/**
 * Controller de cuota diaria de las fuentes externas.
 *
 * En modo mock la cuota no aplica: no se toca el tracker (evita I/O de disco
 * innecesaria) y se responde con `mockMode: true` en vez de numeros
 * inventados. En modo real expone el snapshot real del tracker.
 */

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('../services/quota/quotaTracker.js').createQuotaTracker>} deps.quotaTracker
 * @param {{useMockSources: boolean}} deps.config
 */
export function createQuotaController({ quotaTracker, config }) {
  return {
    /** GET /api/quota */
    async getQuota(_req, res) {
      if (config.useMockSources) {
        return res.status(200).json({
          mockMode: true,
          sources: ['abuseipdb', 'virustotal', 'urlhaus'].map((source) => ({
            source,
            limit: null,
            used: null,
            remaining: null,
            resetAt: null,
            unlimited: true,
          })),
        });
      }

      res.status(200).json({
        mockMode: false,
        sources: quotaTracker.getStatus(),
      });
    },
  };
}
