import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

let app;

beforeEach(() => {
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true', HISTORY_MAX_ENTRIES: '3' }));
});

/** @param {string} value */
function scanIp(value) {
  return request(app).post('/api/scan/ip').send({ value });
}

describe('GET /api/history', () => {
  it('starts empty', async () => {
    const { body } = await request(app).get('/api/history');
    expect(body).toMatchObject({ items: [], total: 0 });
  });

  it('returns a scan that was just performed', async () => {
    await scanIp('192.0.2.1');
    const { body } = await request(app).get('/api/history');
    expect(body.items).toHaveLength(1);
  });

  it('returns the most recent scan first', async () => {
    await scanIp('192.0.2.1');
    await scanIp('198.51.100.14');
    const { body } = await request(app).get('/api/history');
    expect(body.items.map((item) => item.ioc.value)).toEqual([
      '198.51.100.14',
      '192.0.2.1',
    ]);
  });

  it('does not record a rejected scan', async () => {
    await scanIp('999.999.999.999');
    const { body } = await request(app).get('/api/history');
    expect(body.total).toBe(0);
  });

  it('caps the stored history at the configured maximum', async () => {
    for (const value of ['192.0.2.1', '192.0.2.2', '192.0.2.3', '192.0.2.4']) {
      await scanIp(value);
    }
    const { body } = await request(app).get('/api/history');
    expect(body.total).toBe(3);
  });

  it('honours the limit parameter', async () => {
    await scanIp('192.0.2.1');
    await scanIp('192.0.2.2');
    const { body } = await request(app).get('/api/history?limit=1');
    expect(body.items).toHaveLength(1);
  });

  it('honours the offset parameter', async () => {
    await scanIp('192.0.2.1');
    await scanIp('192.0.2.2');
    const { body } = await request(app).get('/api/history?limit=1&offset=1');
    expect(body.items[0].ioc.value).toBe('192.0.2.1');
  });

  it('echoes the effective pagination back to the client', async () => {
    const { body } = await request(app).get('/api/history?limit=5&offset=2');
    expect(body).toMatchObject({ limit: 5, offset: 2 });
  });

  it('rejects a non-numeric limit with 400', async () => {
    const response = await request(app).get('/api/history?limit=muchos');
    expect(response.status).toBe(400);
  });

  it('rejects a negative offset with 400', async () => {
    const response = await request(app).get('/api/history?offset=-1');
    expect(response.status).toBe(400);
  });

  it('rejects a limit above the configured page-size cap with 400', async () => {
    const response = await request(app).get('/api/history?limit=100000');
    expect(response.status).toBe(400);
  });

  it('rejects a limit of zero with 400', async () => {
    const response = await request(app).get('/api/history?limit=0');
    expect(response.status).toBe(400);
  });

  it('names the offending query parameter in the error', async () => {
    const { body } = await request(app).get('/api/history?limit=muchos');
    expect(body.error.field).toBe('limit');
  });
});
