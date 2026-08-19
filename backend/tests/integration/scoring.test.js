/**
 * Tests de POST /api/score/custom.
 *
 * Este endpoint contiene VULN-03 (CWE-95) a proposito. Los payloads de este
 * archivo demuestran ejecucion de codigo arbitrario SIN tocar el sistema de
 * archivos ni procesos externos: leen variables del propio proceso de test
 * (`globalThis`, `process.env`) en vez de invocar algo destructivo, para que
 * la suite sea segura de correr en cualquier runner sin pensarlo dos veces.
 *
 * Ver docs/vulnerabilities/VULN-03.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

let app;

beforeAll(() => {
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
});

describe('POST /api/score/custom', () => {
  it('evalua una formula aritmetica legitima', async () => {
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'abuseScore * 0.6 + vtScore * 0.4' });

    expect(response.status).toBe(200);
    // BASELINE_SCORES: abuseScore=42, vtScore=17
    expect(response.body.result).toBeCloseTo(42 * 0.6 + 17 * 0.4);
  });

  it('expone los inputs usados en la formula', async () => {
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'abuseScore' });

    expect(response.body.inputs).toEqual({ abuseScore: 42, vtScore: 17, urlhausScore: 0 });
  });

  it('acepta las tres variables normalizadas', async () => {
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'Math.max(abuseScore, vtScore, urlhausScore)' });

    expect(response.status).toBe(200);
    expect(response.body.result).toBe(42);
  });

  it('rechaza una formula ausente', async () => {
    const response = await request(app).post('/api/score/custom').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_FORMULA');
  });

  it('rechaza una formula que no es cadena', async () => {
    const response = await request(app).post('/api/score/custom').send({ formula: 42 });

    expect(response.status).toBe(400);
  });

  it('rechaza un resultado no numerico con 422', async () => {
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: '"no soy un numero"' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('FORMULA_NOT_NUMERIC');
  });

  it('rechaza NaN e Infinity como resultado', async () => {
    const nan = await request(app).post('/api/score/custom').send({ formula: '0/0' });
    const inf = await request(app).post('/api/score/custom').send({ formula: '1/0' });

    expect(nan.status).toBe(422);
    expect(inf.status).toBe(422);
  });
});

describe('VULN-03 (CWE-95) — inyeccion de codigo via eval, INTENCIONAL', () => {
  // Estos tests afirman el comportamiento VULNERABLE. Si alguno falla porque el
  // endpoint dejo de evaluar codigo arbitrario, no lo "arregles" relajando la
  // asercion: significa que alguien corrigio VULN-03, y entonces lo que toca es
  // retirar la vulnerabilidad del inventario y borrar este bloque.

  it('ejecuta JavaScript arbitrario, no solo aritmetica', async () => {
    // Una formula legitima no tendria motivo para usar una IIFE con efectos
    // secundarios. Esto demuestra que el interprete completo esta disponible,
    // no una gramatica de expresiones restringida.
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: '(() => { globalThis.__vuln03Marker = "ejecutado"; return 1; })()' });

    expect(response.status).toBe(200);
    expect(globalThis.__vuln03Marker).toBe('ejecutado');
    delete globalThis.__vuln03Marker;
  });

  it('lee variables de entorno del proceso del servidor', async () => {
    process.env.VULN03_TEST_PROBE = 'valor-secreto-de-prueba';

    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'process.env.VULN03_TEST_PROBE.length' });

    expect(response.status).toBe(200);
    expect(response.body.result).toBe('valor-secreto-de-prueba'.length);

    delete process.env.VULN03_TEST_PROBE;
  });

  it('no restringe la formula a las tres variables conocidas', async () => {
    // Prueba de "no hay lista blanca": referencia globals de Node fuera del
    // ambito documentado (abuseScore, vtScore, urlhausScore) y aun asi corre.
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'typeof require === "function" || typeof process === "object" ? 1 : 0' });

    expect(response.status).toBe(200);
    expect(response.body.result).toBe(1);
  });

  it('no valida la formula contra ninguna gramatica: sentencias, no solo expresiones', async () => {
    const response = await request(app)
      .post('/api/score/custom')
      .send({ formula: 'let __x = 2; __x = __x * 21; __x' });

    expect(response.status).toBe(200);
    expect(response.body.result).toBe(42);
  });
});
