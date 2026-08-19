/**
 * Tabla de rutas de la API.
 *
 * Las rutas solo enlazan: middleware de validacion -> controller. Ninguna logica
 * de negocio vive aqui.
 */

import { Router } from 'express';
import { validateScanBody, validatePagination } from '../middleware/validateRequest.js';

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {ReturnType<import('../controllers/healthController.js').createHealthController>} deps.healthController
 * @param {ReturnType<import('../controllers/scanController.js').createScanController>} deps.scanController
 * @param {ReturnType<import('../controllers/historyController.js').createHistoryController>} deps.historyController
 * @param {ReturnType<import('../controllers/quotaController.js').createQuotaController>} deps.quotaController
 * @param {ReturnType<import('../controllers/enrichmentController.js').createEnrichmentController>} deps.enrichmentController
 */
export function createApiRouter({
  config,
  healthController,
  scanController,
  historyController,
  quotaController,
  enrichmentController,
}) {
  const router = Router();

  router.get('/health', healthController.getHealth);

  router.post('/scan/ip', validateScanBody, scanController.scanIp);
  router.post('/scan/hash', validateScanBody, scanController.scanHash);
  router.post('/scan/domain', validateScanBody, scanController.scanDomain);

  router.get('/history', validatePagination(config), historyController.listHistory);

  router.get('/quota', quotaController.getQuota);

  // El cuerpo es `{ hash }` y no `{ value }`, asi que no pasa por
  // `validateScanBody`: el propio controller valida el hash con `hashAlgorithm()`
  // antes de usarlo. VULN-02 es CWE-798 y nada mas -- aqui no falta validacion.
  // Ver docs/vulnerabilities/VULN-02.md
  router.post('/enrich/payload', enrichmentController.enrichPayload);

  return router;
}
