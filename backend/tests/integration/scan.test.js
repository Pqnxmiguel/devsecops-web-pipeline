import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

let app;

beforeEach(() => {
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
});

describe('POST /api/scan/ip', () => {
  it('responds 200 for a valid address', async () => {
    const response = await request(app).post('/api/scan/ip').send({ value: '192.0.2.1' });
    expect(response.status).toBe(200);
  });

  it('returns the normalised IOC', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: ' 192.0.2.1 ' });
    expect(body.ioc).toEqual({ type: 'ip', value: '192.0.2.1', ipVersion: 4 });
  });

  it('returns a clean verdict for the pinned clean address', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: '192.0.2.1' });
    expect(body.verdict.level).toBe('clean');
  });

  it('returns a suspicious verdict for the pinned suspicious address', async () => {
    const { body } = await request(app)
      .post('/api/scan/ip')
      .send({ value: '198.51.100.14' });
    expect(body.verdict.level).toBe('suspicious');
  });

  it('returns a malicious verdict for the pinned malicious address', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: '203.0.113.66' });
    expect(body.verdict.level).toBe('malicious');
  });

  it('includes the per-source reports', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: '192.0.2.1' });
    expect(body.sources[0].source).toBe('abuseipdb');
  });

  it('flags the scan as resolved with mocked sources', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: '192.0.2.1' });
    expect(body.mock).toBe(true);
  });

  it('rejects a malformed address with 400', async () => {
    const response = await request(app).post('/api/scan/ip').send({ value: '999.1.1.1' });
    expect(response.status).toBe(400);
  });

  it('tells the client which field was wrong', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: '999.1.1.1' });
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'value' });
  });

  it('rejects a missing value with 400', async () => {
    const response = await request(app).post('/api/scan/ip').send({});
    expect(response.status).toBe(400);
  });

  it('rejects a non-string value with 400', async () => {
    const response = await request(app).post('/api/scan/ip').send({ value: 12345 });
    expect(response.status).toBe(400);
  });

  it('rejects an object value with 400 instead of coercing it', async () => {
    const response = await request(app)
      .post('/api/scan/ip')
      .send({ value: { toString: 'x' } });
    expect(response.status).toBe(400);
  });

  it('rejects unexpected extra fields with 400', async () => {
    const response = await request(app)
      .post('/api/scan/ip')
      .send({ value: '192.0.2.1', admin: true });
    expect(response.status).toBe(400);
  });

  it('rejects a CIDR range because an IOC is a single address', async () => {
    const response = await request(app).post('/api/scan/ip').send({ value: '10.0.0.0/8' });
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON with 400 rather than 500', async () => {
    const response = await request(app)
      .post('/api/scan/ip')
      .set('Content-Type', 'application/json')
      .send('{"value": ');
    expect(response.status).toBe(400);
  });

  it('rejects an oversized body with 413', async () => {
    const response = await request(app)
      .post('/api/scan/ip')
      .send({ value: 'a'.repeat(200_000) });
    expect(response.status).toBe(413);
  });

  it('never includes a stack trace in an error response', async () => {
    const { body } = await request(app).post('/api/scan/ip').send({ value: 'nope' });
    expect(JSON.stringify(body)).not.toContain('at ');
  });
});

describe('POST /api/scan/hash', () => {
  it('returns a clean verdict for the pinned clean hash', async () => {
    const { body } = await request(app)
      .post('/api/scan/hash')
      .send({ value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
    expect(body.verdict.level).toBe('clean');
  });

  it('returns a malicious verdict for the pinned malicious hash', async () => {
    const { body } = await request(app)
      .post('/api/scan/hash')
      .send({ value: '44d88612fea8a8f36de82e1278abb02f' });
    expect(body.verdict.level).toBe('malicious');
  });

  it('derives the algorithm from the hash length', async () => {
    const { body } = await request(app)
      .post('/api/scan/hash')
      .send({ value: '44d88612fea8a8f36de82e1278abb02f' });
    expect(body.ioc.algorithm).toBe('md5');
  });

  it('queries VirusTotal for hashes', async () => {
    const { body } = await request(app)
      .post('/api/scan/hash')
      .send({ value: '44d88612fea8a8f36de82e1278abb02f' });
    expect(body.sources.map((s) => s.source)).toEqual(['virustotal']);
  });

  it('rejects a hash of the wrong length with 400', async () => {
    const response = await request(app).post('/api/scan/hash').send({ value: 'abc123' });
    expect(response.status).toBe(400);
  });

  it('rejects a hash with a non-hex character with 400', async () => {
    const response = await request(app)
      .post('/api/scan/hash')
      .send({ value: 'z4d88612fea8a8f36de82e1278abb02f' });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/scan/domain', () => {
  it('returns a clean verdict for the pinned clean domain', async () => {
    const { body } = await request(app)
      .post('/api/scan/domain')
      .send({ value: 'ejemplo.com' });
    expect(body.verdict.level).toBe('clean');
  });

  it('returns a malicious verdict for the pinned malicious domain', async () => {
    const { body } = await request(app)
      .post('/api/scan/domain')
      .send({ value: 'malicious.example' });
    expect(body.verdict.level).toBe('malicious');
  });

  it('queries URLhaus for domains', async () => {
    const { body } = await request(app)
      .post('/api/scan/domain')
      .send({ value: 'ejemplo.com' });
    expect(body.sources.map((s) => s.source)).toEqual(['urlhaus']);
  });

  it('rejects a domain carrying a shell metacharacter with 400', async () => {
    const response = await request(app)
      .post('/api/scan/domain')
      .send({ value: 'ejemplo.com; whoami' });
    expect(response.status).toBe(400);
  });

  it('rejects a URL rather than accepting it as a domain', async () => {
    const response = await request(app)
      .post('/api/scan/domain')
      .send({ value: 'http://ejemplo.com/path' });
    expect(response.status).toBe(400);
  });

  it('rejects a path traversal attempt with 400', async () => {
    const response = await request(app)
      .post('/api/scan/domain')
      .send({ value: '../../etc/passwd' });
    expect(response.status).toBe(400);
  });
});

describe('unsupported scan types', () => {
  it('answers 404 for a scan type that does not exist', async () => {
    const response = await request(app).post('/api/scan/url').send({ value: 'x' });
    expect(response.status).toBe(404);
  });
});
