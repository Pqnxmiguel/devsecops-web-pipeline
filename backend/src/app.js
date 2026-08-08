/**
 * Ensamblado de la aplicacion Express.
 *
 * `createApp` recibe la configuracion y construye el grafo de dependencias
 * completo (fuentes -> servicio -> controllers). No escucha en ningun puerto:
 * de eso se encarga `index.js`. Asi los tests pueden instanciar una app aislada
 * -- con su propio historial y sus propios limites -- sin abrir sockets.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config as defaultConfig } from './config/index.js';
import { createSources } from './services/sources/index.js';
import { createScanService } from './services/scanService.js';
import { createQuotaTracker } from './services/quota/quotaTracker.js';
import { createInMemoryHistoryRepository } from './models/historyRepository.js';
import { createHealthController } from './controllers/healthController.js';
import { createScanController } from './controllers/scanController.js';
import { createHistoryController } from './controllers/historyController.js';
import { createQuotaController } from './controllers/quotaController.js';
import { createDiagnosticsController } from './controllers/diagnosticsController.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** Tope del cuerpo JSON: un scan son ~50 bytes; 10 kB ya es holgadisimo. */
const JSON_BODY_LIMIT = '10kb';

/**
 * @param {typeof defaultConfig} [config]
 */
export function createApp(config = defaultConfig) {
  const app = express();

  // No anunciar el framework: no es seguridad real, pero es informacion gratis
  // para quien enumera objetivos.
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      // Lista blanca explicita. Sin comodin: con `*` cualquier pagina podria
      // llamar a esta API desde el navegador de la victima.
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST'],
      maxAge: 600,
    }),
  );

  // El rate limiting va ANTES del parseo del cuerpo: un cliente abusivo no debe
  // conseguir que gastemos CPU parseando su JSON antes de rechazarlo.
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Demasiadas peticiones. Intentalo de nuevo mas tarde.',
          },
        });
      },
    }),
  );

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // --- Grafo de dependencias -------------------------------------------------
  // El tracker se construye siempre (mock o real): no hace I/O de disco hasta
  // que alguno de sus metodos se invoca, y eso solo ocurre en la rama real de
  // cada fuente y en el controller de cuota cuando `useMockSources` es false.
  const quotaTracker = createQuotaTracker({
    limits: {
      abuseipdb: config.abuseipdbDailyLimit,
      virustotal: config.virustotalDailyLimit,
    },
  });
  const sources = createSources(config, { quotaTracker });
  const historyRepository = createInMemoryHistoryRepository({
    maxEntries: config.historyMaxEntries,
  });
  const scanService = createScanService({
    sources,
    historyRepository,
    useMock: config.useMockSources,
  });

  app.use(
    '/api',
    createApiRouter({
      config,
      healthController: createHealthController({ config, sources }),
      scanController: createScanController(scanService),
      historyController: createHistoryController(historyRepository),
      quotaController: createQuotaController({ quotaTracker, config }),
      diagnosticsController: createDiagnosticsController(),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
