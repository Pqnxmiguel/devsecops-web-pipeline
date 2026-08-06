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
 */
export function createApiRouter({ config, healthController, scanController, historyController }) {
  const router = Router();

  router.get('/health', healthController.getHealth);

  router.post('/scan/ip', validateScanBody, scanController.scanIp);
  router.post('/scan/hash', validateScanBody, scanController.scanHash);
  router.post('/scan/domain', validateScanBody, scanController.scanDomain);

  router.get('/history', validatePagination(config), historyController.listHistory);

  return router;
}
