import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { fetchJson } from '../../src/utils/httpClient.js';
import { SourceError } from '../../src/utils/errors.js';

/**
 * Servidor real en localhost en vez de mockear `fetch`: lo que se prueba es el
 * comportamiento del cliente frente a la red (timeouts, codigos de estado,
 * cuerpos rotos), y un mock de fetch no probaria nada de eso.
 */
let server;
let baseUrl;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    } else if (req.url === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      }, 2000).unref();
    } else if (req.url === '/rate-limited') {
      res.writeHead(429).end('slow down');
    } else if (req.url === '/boom') {
      res.writeHead(500).end('kaboom internal detail');
    } else if (req.url === '/echo') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, body }));
      });
    } else if (req.url === '/not-json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('<html>nope</html>');
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('fetchJson', () => {
  it('returns the parsed body on success', async () => {
    await expect(fetchJson(`${baseUrl}/ok`, { source: 'test' })).resolves.toEqual({
      hello: 'world',
    });
  });

  it('aborts a slow response once the timeout budget is spent', async () => {
    await expect(
      fetchJson(`${baseUrl}/slow`, { source: 'test', timeoutMs: 100 }),
    ).rejects.toThrow(SourceError);
  });

  it('classifies a spent timeout budget as kind "timeout"', async () => {
    await expect(
      fetchJson(`${baseUrl}/slow`, { source: 'test', timeoutMs: 100 }),
    ).rejects.toMatchObject({ kind: 'timeout', source: 'test' });
  });

  it('returns from a slow endpoint before the test times out', async () => {
    const startedAt = Date.now();
    await fetchJson(`${baseUrl}/slow`, { source: 'test', timeoutMs: 100 }).catch(
      () => {},
    );
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('classifies HTTP 429 as kind "rate_limit"', async () => {
    await expect(
      fetchJson(`${baseUrl}/rate-limited`, { source: 'test' }),
    ).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('classifies HTTP 5xx as kind "unavailable"', async () => {
    await expect(fetchJson(`${baseUrl}/boom`, { source: 'test' })).rejects.toMatchObject(
      { kind: 'unavailable' },
    );
  });

  it('does not leak the upstream error body in the message', async () => {
    await expect(fetchJson(`${baseUrl}/boom`, { source: 'test' })).rejects.not.toThrow(
      /kaboom internal detail/,
    );
  });

  it('classifies an unparseable body as kind "bad_response"', async () => {
    await expect(
      fetchJson(`${baseUrl}/not-json`, { source: 'test' }),
    ).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('classifies a connection refused as kind "unavailable"', async () => {
    await expect(
      fetchJson('http://127.0.0.1:1/nowhere', { source: 'test', timeoutMs: 500 }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('exposes the upstream status so a caller can special-case a 404', async () => {
    await expect(
      fetchJson(`${baseUrl}/missing`, { source: 'test' }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('sends a form-encoded body when asked to POST, as URLhaus requires', async () => {
    const echoed = await fetchJson(`${baseUrl}/echo`, {
      source: 'test',
      method: 'POST',
      form: { host: 'ejemplo.com' },
    });
    expect(echoed).toEqual({ method: 'POST', body: 'host=ejemplo.com' });
  });
});
