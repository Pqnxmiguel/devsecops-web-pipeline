/**
 * Controller de scans.
 *
 * Un controller aqui solo hace tres cosas: leer el request, delegar en el
 * servicio y elegir el codigo de estado. Sin try/catch: Express 5 propaga el
 * rechazo de un handler async al middleware de errores.
 */

/**
 * @param {{scan: (type: string, value: unknown) => Promise<object>}} scanService
 */
export function createScanController(scanService) {
  /** @param {'ip'|'hash'|'domain'} type */
  function handlerFor(type) {
    return async function scanHandler(req, res) {
      const scan = await scanService.scan(type, req.body.value);
      res.status(200).json(scan);
    };
  }

  return {
    scanIp: handlerFor('ip'),
    scanHash: handlerFor('hash'),
    scanDomain: handlerFor('domain'),
  };
}
