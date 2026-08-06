/**
 * Controller de health check.
 *
 * Expone estado, uptime, version y modo de fuentes. `mockMode` esta a proposito:
 * saber si una instancia responde con datos simulados es informacion
 * operativa de primer orden, no un detalle a esconder.
 */

/**
 * @param {object} deps
 * @param {{version: string, useMockSources: boolean}} deps.config
 * @param {{id: string}[]} deps.sources
 */
export function createHealthController({ config, sources }) {
  return {
    async getHealth(_req, res) {
      res.status(200).json({
        status: 'ok',
        uptime: Number(process.uptime().toFixed(3)),
        version: config.version,
        mockMode: config.useMockSources,
        sources: sources.map((source) => source.id),
        timestamp: new Date().toISOString(),
      });
    },
  };
}
