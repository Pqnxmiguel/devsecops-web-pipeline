import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

let app;

beforeAll(() => {
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
});

describe('GET /api/health', () => {
  it('responds 200', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });

  it('reports an ok status', async () => {
    const { body } = await request(app).get('/api/health');
    expect(body.status).toBe('ok');
  });

  it('reports the process uptime in seconds', async () => {
    const { body } = await request(app).get('/api/health');
    expect(typeof body.uptime).toBe('number');
  });

  it('reports the application version', async () => {
    const { body } = await request(app).get('/api/health');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('says whether the sources are mocked', async () => {
    const { body } = await request(app).get('/api/health');
    expect(body.mockMode).toBe(true);
  });

  it('lists the configured sources', async () => {
    const { body } = await request(app).get('/api/health');
    expect(body.sources).toEqual(['abuseipdb', 'virustotal', 'urlhaus']);
  });
});

describe('baseline hardening', () => {
  it('does not advertise the framework in x-powered-by', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sends the nosniff header', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers an unknown route with a JSON error envelope', async () => {
    const response = await request(app).get('/api/no-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('CORS', () => {
  it('echoes an allowed origin back', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('never answers with a wildcard origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('omits the CORS header entirely for a disallowed origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('answers 429 once a client exceeds its budget', async () => {
    const limitedApp = createApp(
      loadConfig({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' }),
    );
    await request(limitedApp).get('/api/health');
    await request(limitedApp).get('/api/health');
    const third = await request(limitedApp).get('/api/health');
    expect(third.status).toBe(429);
  });

  it('answers a throttled request with the JSON error envelope', async () => {
    const limitedApp = createApp(loadConfig({ RATE_LIMIT_MAX: '1' }));
    await request(limitedApp).get('/api/health');
    const second = await request(limitedApp).get('/api/health');
    expect(second.body.error.code).toBe('RATE_LIMITED');
  });
});
