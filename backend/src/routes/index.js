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
 * @param {ReturnType<import('../controllers/diagnosticsController.js').createDiagnosticsController>} deps.diagnosticsController
 */
export function createApiRouter({
  config,
  healthController,
  scanController,
  historyController,
  quotaController,
  diagnosticsController,
}) {
  const router = Router();

  router.get('/health', healthController.getHealth);

  router.post('/scan/ip', validateScanBody, scanController.scanIp);
  router.post('/scan/hash', validateScanBody, scanController.scanHash);
  router.post('/scan/domain', validateScanBody, scanController.scanDomain);

  router.get('/history', validatePagination(config), historyController.listHistory);

  router.get('/quota', quotaController.getQuota);

  // [VULN-INTENCIONAL: CWE-78] Esta ruta se registra SIN `validateScanBody`, a
  // diferencia de /scan/domain. Esa ausencia de validacion es el primero de los
  // dos fallos encadenados de VULN-01. Ver docs/vulnerabilities/VULN-01.md
  router.post('/diagnose/dns', diagnosticsController.resolveDns);

  return router;
}
