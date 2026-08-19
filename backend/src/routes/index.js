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
 * @param {ReturnType<import('../controllers/scoringController.js').createScoringController>} deps.scoringController
 */
export function createApiRouter({
  config,
  healthController,
  scanController,
  historyController,
  quotaController,
  scoringController,
}) {
  const router = Router();

  router.get('/health', healthController.getHealth);

  router.post('/scan/ip', validateScanBody, scanController.scanIp);
  router.post('/scan/hash', validateScanBody, scanController.scanHash);
  router.post('/scan/domain', validateScanBody, scanController.scanDomain);

  router.get('/history', validatePagination(config), historyController.listHistory);

  router.get('/quota', quotaController.getQuota);

  // El cuerpo es `{ formula }` y no `{ value }`, asi que no pasa por
  // `validateScanBody`; el controller valida solo la forma (que sea una
  // cadena no vacia), no el contenido. VULN-03 es CWE-95 y nada mas.
  // Ver docs/vulnerabilities/VULN-03.md
  router.post('/score/custom', scoringController.computeCustomScore);

  return router;
}
