/**
 * Tests de POST /api/enrich/payload.
 *
 * Este endpoint contiene VULN-02 (CWE-798) a proposito. Ninguna llamada real
 * sale de aqui: la ruta por defecto corre en modo mock, y la rama real se
 * ejercita construyendo el controller con un `fetchJson` inyectado.
 *
 * El literal de la credencial NO se repite en este archivo a proposito. Se
 * afirma la propiedad que define la vulnerabilidad -- la key no depende de la
 * configuracion, es la misma pase lo que pase en el entorno -- en vez de copiar
 * el secreto a un segundo sitio.
 *
 * Ver docs/vulnerabilities/VULN-02.md
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createEnrichmentController } from '../../src/controllers/enrichmentController.js';

/** SHA-256 de EICAR: hash real, publico y sin ningun binario detras. */
const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
const SOME_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';

let app;

beforeAll(() => {
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
});

/** Doble de `res` minimo: solo `status().json()`, que es todo lo que usa el controller. */
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/**
 * Ejercita la rama REAL del controller (sin red) y devuelve las opciones con
 * las que se habria hecho la peticion saliente.
 * @param {object} [overrides]
 */
async function captureOutboundRequest({ hash = EICAR_SHA256, config = {} } = {}) {
  const fetchJson = vi.fn().mockResolvedValue({
    query_status: 'ok',
    file_type: 'exe',
    signature: 'Emotet',
    firstseen: '2026-01-02 03:04:05',
  });

  const controller = createEnrichmentController({
    config: { useMockSources: false, sourceTimeoutMs: 5000, ...config },
    fetchJson,
  });

  const res = fakeRes();
  await controller.enrichPayload({ body: { hash } }, res);

  return { fetchJson, res, options: fetchJson.mock.calls.at(-1)?.[1] };
}

describe('POST /api/enrich/payload', () => {
  it('responde 200 con un informe de payload en modo mock', async () => {
    const response = await request(app)
      .post('/api/enrich/payload')
      .send({ hash: EICAR_SHA256 });

    expect(response.status).toBe(200);
    expect(response.body.hash).toBe(EICAR_SHA256);
    expect(response.body.known).toBe(false);
  });

  it('acepta tambien un MD5', async () => {
    const response = await request(app).post('/api/enrich/payload').send({ hash: SOME_MD5 });

    expect(response.status).toBe(200);
    expect(response.body.hash).toBe(SOME_MD5);
  });

  it('normaliza el hash a minusculas antes de usarlo', async () => {
    const response = await request(app)
      .post('/api/enrich/payload')
      .send({ hash: EICAR_SHA256.toUpperCase() });

    expect(response.status).toBe(200);
    expect(response.body.hash).toBe(EICAR_SHA256);
  });

  it('rechaza un hash ausente', async () => {
    const response = await request(app).post('/api/enrich/payload').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.field).toBe('hash');
  });

  it('rechaza un hash que no es hexadecimal', async () => {
    const response = await request(app)
      .post('/api/enrich/payload')
      .send({ hash: 'z'.repeat(64) });

    expect(response.status).toBe(400);
  });

  it('rechaza SHA-1, que URLhaus no indexa', async () => {
    const response = await request(app)
      .post('/api/enrich/payload')
      .send({ hash: 'a'.repeat(40) });

    expect(response.status).toBe(400);
  });

  it('no toca la red en modo mock', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await request(app).post('/api/enrich/payload').send({ hash: EICAR_SHA256 });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('modo real (con el cliente HTTP inyectado)', () => {
  it('consulta el endpoint de payloads de URLhaus', async () => {
    const { fetchJson } = await captureOutboundRequest();

    expect(fetchJson.mock.calls.at(-1)?.[0]).toBe('https://urlhaus-api.abuse.ch/v1/payload/');
  });

  it('manda el hash en el campo que corresponde a su algoritmo', async () => {
    const sha256 = await captureOutboundRequest({ hash: EICAR_SHA256 });
    const md5 = await captureOutboundRequest({ hash: SOME_MD5 });

    expect(sha256.options.form).toEqual({ sha256_hash: EICAR_SHA256 });
    expect(md5.options.form).toEqual({ md5_hash: SOME_MD5 });
  });

  it('traduce la respuesta de URLhaus a un informe de payload', async () => {
    const { res } = await captureOutboundRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      hash: EICAR_SHA256,
      known: true,
      fileType: 'exe',
      signature: 'Emotet',
      firstSeen: '2026-01-02 03:04:05',
    });
  });

  it('no valida el hash despues de rechazarlo: nunca llega a llamar', async () => {
    const fetchJson = vi.fn();
    const controller = createEnrichmentController({
      config: { useMockSources: false },
      fetchJson,
    });

    await expect(
      controller.enrichPayload({ body: { hash: 'no-es-un-hash' } }, fakeRes()),
    ).rejects.toThrow();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('VULN-02 (CWE-798) — credencial hardcodeada, INTENCIONAL', () => {
  // Estos tests afirman el comportamiento VULNERABLE. Si alguno falla porque la
  // key paso a leerse de configuracion, no lo "arregles" relajando la asercion:
  // significa que alguien corrigio VULN-02, y entonces lo que toca es retirar la
  // vulnerabilidad del inventario y borrar este bloque.

  it('autentica contra abuse.ch con una Auth-Key que no viene del entorno', async () => {
    const { options } = await captureOutboundRequest();

    expect(options.headers['Auth-Key']).toEqual(expect.any(String));
    expect(options.headers['Auth-Key'].length).toBeGreaterThan(16);
  });

  it('ignora la credencial configurada: manda siempre la del codigo fuente', async () => {
    const { options } = await captureOutboundRequest({
      config: { urlhausAuthKey: 'LA-QUE-VIENE-DEL-ENTORNO' },
    });

    // `urlhaus.js` si usaria esta; este controller ni la mira.
    expect(options.headers['Auth-Key']).not.toBe('LA-QUE-VIENE-DEL-ENTORNO');
  });

  it('manda la MISMA key con configuraciones distintas: esta fijada en el codigo', async () => {
    const primera = await captureOutboundRequest({ config: { urlhausAuthKey: 'una' } });
    const segunda = await captureOutboundRequest({ config: { urlhausAuthKey: 'otra' } });

    expect(primera.options.headers['Auth-Key']).toBe(segunda.options.headers['Auth-Key']);
  });
});
