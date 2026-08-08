import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../src/app.js';
import { createQuotaController } from '../../src/controllers/quotaController.js';
import { createApiRouter } from '../../src/routes/index.js';
import { loadConfig } from '../../src/config/index.js';

describe('GET /api/quota en modo mock', () => {
  it('responde 200', async () => {
    const app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
    const response = await request(app).get('/api/quota');
    expect(response.status).toBe(200);
  });

  it('declara mockMode:true en vez de numeros de cuota', async () => {
    const app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
    const { body } = await request(app).get('/api/quota');
    expect(body.mockMode).toBe(true);
  });

  it('reporta las tres fuentes como no limitadas cuando esta en modo mock', async () => {
    const app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
    const { body } = await request(app).get('/api/quota');
    expect(body.sources.map((s) => s.source)).toEqual(['abuseipdb', 'virustotal', 'urlhaus']);
    expect(body.sources.every((s) => s.unlimited === true)).toBe(true);
  });

  it('no expone limit/remaining como numeros inventados en modo mock', async () => {
    const app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
    const { body } = await request(app).get('/api/quota');
    for (const source of body.sources) {
      expect(source.limit).toBeNull();
      expect(source.remaining).toBeNull();
    }
  });
});

describe('GET /api/quota en modo real', () => {
  it('devuelve mockMode:false y delega en quotaTracker.getStatus()', async () => {
    const app = express();
    app.use(express.json());
    const fakeStatus = [
      { source: 'abuseipdb', limit: 1000, used: 3, remaining: 997, resetAt: '2026-08-08T00:00:00.000Z', unlimited: false },
      { source: 'virustotal', limit: 500, used: 10, remaining: 490, resetAt: '2026-08-08T00:00:00.000Z', unlimited: false },
      { source: 'urlhaus', limit: null, used: 5, remaining: null, resetAt: null, unlimited: true },
    ];
    const quotaTracker = { getStatus: () => fakeStatus };
    const quotaController = createQuotaController({
      quotaTracker,
      config: { useMockSources: false },
    });
    app.use(
      '/api',
      createApiRouter({
        config: { historyMaxPageSize: 100 },
        healthController: { getHealth: (_req, res) => res.status(200).json({}) },
        scanController: {
          scanIp: (_req, res) => res.status(200).json({}),
          scanHash: (_req, res) => res.status(200).json({}),
          scanDomain: (_req, res) => res.status(200).json({}),
        },
        historyController: { listHistory: (_req, res) => res.status(200).json({}) },
        quotaController,
        diagnosticsController: { resolveDns: (_req, res) => res.status(200).json({}) },
      }),
    );

    const { body, status } = await request(app).get('/api/quota');
    expect(status).toBe(200);
    expect(body).toEqual({ mockMode: false, sources: fakeStatus });
  });
});
