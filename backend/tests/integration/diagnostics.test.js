/**
 * Tests de POST /api/diagnose/dns.
 *
 * Este endpoint contiene VULN-01 (CWE-78) a proposito. `child_process` esta
 * mockeado en TODO el archivo: estos tests demuestran la inyeccion inspeccionando
 * el comando que SE HABRIA ejecutado, sin llegar a lanzar ningun proceso. Ejecutar
 * de verdad la carga inyectada seria innecesario para probar el punto y
 * convertiria la suite en algo que no se puede correr sin pensarlo dos veces.
 *
 * Ver docs/vulnerabilities/VULN-01.md
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

const execMock = vi.hoisted(() => vi.fn());

// Se mockean AMBOS especificadores a proposito. El controller importa
// 'child_process' (sin prefijo) porque de eso depende que los escaneres vean la
// vulnerabilidad; si alguien lo cambiara a 'node:child_process' y aqui solo
// estuviera mockeado uno, estos tests ejecutarian comandos DE VERDAD en el
// runner de CI. Mockeando los dos, el archivo es inmune a ese cambio.
const childProcessMock = { exec: execMock };
vi.mock('child_process', () => ({ ...childProcessMock, default: childProcessMock }));
vi.mock('node:child_process', () => ({ ...childProcessMock, default: childProcessMock }));

const childProcess = await import('child_process');
const { createApp } = await import('../../src/app.js');
const { loadConfig } = await import('../../src/config/index.js');

let app;

beforeAll(() => {
  // Red de seguridad: si el mock no quedo aplicado, aborta el archivo ENTERO
  // antes de correr un solo test. Un `beforeAll` que lanza impide que se
  // ejecute cualquier test de este archivo, incluidos los que inyectan
  // comandos. La diferencia entre "hoy es seguro" y "es seguro por construccion".
  if (!vi.isMockFunction(childProcess.exec)) {
    throw new Error(
      'child_process NO esta mockeado: se aborta para no ejecutar comandos reales.',
    );
  }
  app = createApp(loadConfig({ USE_MOCK_SOURCES: 'true' }));
});

beforeEach(() => {
  execMock.mockReset();
  // Por defecto: resolucion exitosa con una salida cualquiera.
  execMock.mockImplementation((_command, _options, callback) => {
    callback(null, 'Name:\texample.com\nAddress: 93.184.216.34\n', '');
  });
});

/** El comando que el controller le paso a `exec` en la ultima llamada. */
function lastCommand() {
  return execMock.mock.calls.at(-1)?.[0];
}

describe('POST /api/diagnose/dns', () => {
  it('resolves a domain and returns its records', async () => {
    const response = await request(app).post('/api/diagnose/dns').send({ domain: 'example.com' });

    expect(response.status).toBe(200);
    expect(response.body.domain).toBe('example.com');
    expect(response.body.records).toContain('93.184.216.34');
  });

  it('rejects a missing domain', async () => {
    const response = await request(app).post('/api/diagnose/dns').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DOMAIN');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string domain', async () => {
    const response = await request(app).post('/api/diagnose/dns').send({ domain: 42 });

    expect(response.status).toBe(400);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('reports a resolution failure as 502', async () => {
    execMock.mockImplementation((_command, _options, callback) => {
      callback(new Error('nslookup: command not found'), '', '');
    });

    const response = await request(app).post('/api/diagnose/dns').send({ domain: 'example.com' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('RESOLUTION_FAILED');
  });
});

describe('VULN-01 (CWE-78) — inyeccion de comandos, INTENCIONAL', () => {
  // Estos tests afirman el comportamiento VULNERABLE. Si alguno falla porque el
  // endpoint dejo de ser inyectable, no lo "arregles" relajando la asercion:
  // significa que alguien corrigio VULN-01, y entonces lo que toca es retirar
  // la vulnerabilidad del inventario y borrar este bloque.

  it('interpola el input del usuario directo en la shell, sin escapar', async () => {
    await request(app).post('/api/diagnose/dns').send({ domain: 'example.com' });

    expect(lastCommand()).toBe('nslookup example.com');
  });

  it('permite encadenar un segundo comando con ";"', async () => {
    await request(app).post('/api/diagnose/dns').send({ domain: 'example.com; whoami' });

    // La shell ejecutaria `nslookup example.com` Y DESPUES `whoami`.
    expect(lastCommand()).toBe('nslookup example.com; whoami');
  });

  it('permite sustitucion de comandos con $(...)', async () => {
    await request(app).post('/api/diagnose/dns').send({ domain: '$(id)' });

    expect(lastCommand()).toBe('nslookup $(id)');
  });

  it('no aplica la validacion de dominio que si usan los endpoints de scan', async () => {
    const response = await request(app)
      .post('/api/diagnose/dns')
      .send({ domain: 'esto no es un dominio valido | cat /etc/passwd' });

    // Un dominio invalido deberia haberse rechazado con 400 antes de tocar la
    // shell. Llega igual: esa ausencia de validacion es parte de la vulnerabilidad.
    expect(response.status).toBe(200);
    expect(lastCommand()).toContain('| cat /etc/passwd');
  });
});
