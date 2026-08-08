/**
 * Controller de diagnostico de red.
 *
 * Complementa el veredicto de reputacion con contexto DNS: resuelve el dominio
 * consultado usando la utilidad `nslookup` del sistema.
 *
 * ⚠️ ESTE ARCHIVO CONTIENE UNA VULNERABILIDAD INTENCIONAL (VULN-01, CWE-78).
 * No es un descuido. Existe para comprobar que CodeQL y Semgrep la detectan y
 * que el pipeline bloquea. Nunca se despliega.
 * Ver docs/vulnerabilities/VULN-01.md
 */

// Import de namespace y sin el prefijo `node:`, a diferencia del resto del repo
// (que usa `node:net`, `node:os`). NO es un descuido de estilo: las reglas de
// inyeccion de comandos de Semgrep fijan el especificador al literal
// 'child_process' y solo reconocen la llamada en forma de miembro
// (`childProcess.exec`). Con `node:child_process` o con un import
// desestructurado, la vulnerabilidad existe igual pero NINGUN escaner la ve.
// Si alguien "normaliza" este import, apaga la deteccion sin darse cuenta.
// Ver docs/vulnerabilities/VULN-01.md §4
import * as childProcess from 'child_process';

/** Un nslookup que tarda mas que esto no va a mejorar esperandolo. */
const EXEC_TIMEOUT_MS = 5000;

export function createDiagnosticsController() {
  // Declaracion de funcion (no metodo abreviado de objeto) por el mismo motivo:
  // el taint de Semgrep toma como origen los PARAMETROS de una funcion.
  function resolveDns(req, res) {
    const { domain } = req.body ?? {};

    if (typeof domain !== 'string' || domain.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DOMAIN',
          message: 'El campo "domain" es obligatorio y debe ser una cadena.',
        },
      });
    }

    // [VULN-INTENCIONAL: CWE-78] Inyeccion de comandos del sistema operativo.
    // `domain` llega del cuerpo de la peticion y se interpola directo en una
    // cadena que `exec` entrega a la shell, sin validar ni escapar. La shell
    // interpreta `;`, `|`, `&&` y `$(...)`, asi que un valor como
    // `example.com; whoami` ejecuta DOS comandos, no uno.
    //
    // Fix correcto (el que iria en produccion): validar con `isDomain()` de
    // utils/validators.js y usar `execFile('nslookup', [domain])`, que pasa el
    // argumento al binario sin pasar por una shell.
    //
    // Ver docs/vulnerabilities/VULN-01.md
    return childProcess.exec(
      `nslookup ${domain}`,
      { timeout: EXEC_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          return res.status(502).json({
            error: {
              code: 'RESOLUTION_FAILED',
              message: 'No se pudo resolver el dominio.',
            },
          });
        }

        return res.status(200).json({
          domain,
          records: stdout.trim(),
          resolvedAt: new Date().toISOString(),
        });
      },
    );
  }

  return { resolveDns };
}
