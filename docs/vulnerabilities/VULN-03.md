# VULN-03 — Inyección de código vía `eval()` (CWE-95)

| | |
|---|---|
| **CWE** | [CWE-95](https://cwe.mitre.org/data/definitions/95.html) — Eval Injection |
| **Severidad** | Crítica |
| **Ubicación** | `backend/src/controllers/scoringController.js` (llamada a `eval`) |
| **Endpoint** | `POST /api/score/custom` |
| **Ruta** | `backend/src/routes/index.js` — registrada sin `validateScanBody`, a propósito (el cuerpo es `{ formula }`, no `{ value }`) |
| **Detección esperada (medida en local antes de pushear)** | Semgrep — `javascript.lang.security.audit.code-string-concat.code-string-concat` (`error`, bloquea). CodeQL — `js/code-injection`, pendiente de confirmar en CI |
| **Detección real** | _pendiente — se completa con el resultado del run de CI_ |

---

## 1. El defecto

El endpoint deja que un "usuario avanzado" combine los puntajes normalizados de las tres
fuentes (AbuseIPDB, VirusTotal, URLhaus) en un número compuesto, escribiendo su propia
fórmula — por ejemplo `"abuseScore * 0.6 + vtScore * 0.4"` para ponderar más una fuente que
otra. El servidor **evalúa esa cadena tal cual**:

```js
const { abuseScore, vtScore, urlhausScore } = BASELINE_SCORES;
const result = eval(formula);
```

`eval()` no interpreta una gramática de expresiones aritméticas: ejecuta **cualquier
JavaScript**, con acceso completo al intérprete — variables globales de Node
(`process`, `globalThis`), sentencias (`let`, bucles, funciones), y todo lo que el runtime del
proceso del servidor tenga disponible. Quien controle `formula` no está "escribiendo una
fórmula", está escribiendo código que el servidor ejecuta con sus propios privilegios.

No hay ningún intento de restricción: ni una lista blanca de identificadores permitidos, ni un
parser de expresiones, ni un sandbox (`vm`, `vm2`), ni siquiera una comprobación de que la
cadena "parezca" aritmética antes de evaluarla. La única validación es que `formula` sea una
cadena no vacía — una comprobación de **forma**, no de **contenido**, igual que en VULN-01.

## 2. Explotación

```bash
curl -X POST http://127.0.0.1:3000/api/score/custom \
  -H 'Content-Type: application/json' \
  -d '{"formula": "process.env.VIRUSTOTAL_API_KEY"}'
```

Como el controller exige que el resultado sea un número finito (`typeof result !== 'number'`
→ `422`), leer una API key completa como texto no pasa el filtro de salida — pero eso no
cierra el agujero, sólo cambia la forma de explotarlo. Alcanza con convertir la fuga a un
canal numérico, algo trivial en JS:

```bash
-d '{"formula": "[...process.env.VIRUSTOTAL_API_KEY].reduce((a,c)=>a+c.charCodeAt(0),0)"}'
```

**Sobre `require`: no está disponible, y conviene decirlo porque es tentador asumir que sí.**
Este backend es ESM (`"type": "module"`), así que dentro del `eval()` **no hay `require`
global** — verificado: `eval('require("fs")')` lanza `ReferenceError: require is not defined`,
igual que en cualquier otro punto del módulo. Quien explote esto tiene que usar las vías que
sí existen en ESM: `import()` dinámico, o los globals que Node inyecta igual en ambos formatos
(`process`, `globalThis`, `fetch`).

Lo interesante es que la restricción del controller — "el resultado debe ser un número finito"
— **no es una barrera contra la ejecución, sólo filtra qué vuelve en la respuesta.** Un
`import()` dinámico devuelve una promesa, así que usado a pelo rompe el filtro (`typeof
result` sería `"object"`, 422). Pero con el operador coma se puede lanzar una función async
en segundo plano y devolver un número aparte, sin esperarla:

```bash
-d '{"formula": "(async () => { const fs = await import(\"node:fs\"); globalThis.__leak = fs.readFileSync(\"backend/.env\",\"utf8\").length; })(), 1"}'
```

Verificado en local: el `eval()` devuelve `1` de inmediato (pasa el filtro, la API responde
`200` con `result: 1`, como si fuera una fórmula perfectamente normal) y, en segundo plano, la
IIFE async lee `.env` igual. **La respuesta HTTP parece la de una fórmula legítima mientras el
archivo ya se leyó del lado del servidor.** El mismo patrón sirve para `fetch()` a un servidor
del atacante con el contenido como parámetro — exfiltración que nunca pasa por el canal que el
filtro de salida vigila.

**Impacto:** ejecución remota de código con los privilegios del proceso Node — el mismo nivel
que VULN-01, por una ruta distinta, y con el agravante de que el chequeo de "resultado
numérico" puede burlarse activamente en vez de sólo evadirse.

## 3. El fix correcto

No evaluar código del cliente. Punto — no hay una forma "segura" de llamar `eval()` sobre
input no confiable; la mitigación no es sanitizar el string, es no ejecutarlo:

```js
import { evaluateArithmeticExpression } from '../utils/expressionParser.js';

const result = evaluateArithmeticExpression(formula, BASELINE_SCORES);
```

donde `evaluateArithmeticExpression` sería un parser propio y minúsculo — una gramática que
sólo reconoce `+ - * / ( )` y las tres variables conocidas, sin ninguna vía hacia el
intérprete de JavaScript. Ninguna librería de terceros necesaria para algo tan acotado; el
punto es que la superficie de "código ejecutable" sea **cero**, no "reducida".

Si el caso de uso realmente necesitara un lenguaje de expresión más rico, la alternativa es un
motor de sandboxing dedicado (`vm2` está deprecado y roto por diseño — ver
`ajinabraham.njsscan.eval.eval_vm2_injection.*`, cargada en este mismo pipeline; usar el `vm`
nativo de Node tampoco aísla de verdad). La lección de CWE-95 no es "evalúa con más cuidado":
es que combinar "input del cliente" y "el intérprete completo de un lenguaje" es la
vulnerabilidad, independientemente de cuántos filtros se le pongan alrededor.

## 4. Detección: medida en local antes de pushear, y la predicción falló

Al igual que en VULN-01 y VULN-02, se corrió la configuración **literal** del job
`sast-semgrep` (Semgrep 1.172.0 pineado, los seis packs + la regla suelta, la misma exclusión)
sobre esta rama antes de pushearla. Resultado:

```
error  javascript.lang.security.audit.code-string-concat.code-string-concat
       backend/src/controllers/scoringController.js:61
```

Un bloqueante. Pero **la predicción original de
[`README.md`](README.md) §2 — que la detectaría `detect-eval-with-expression` — es falsa.**
Comprobado de forma aislada, esa regla existe en el pack (cargada, sin errores de ejecución) y
**no dispara sobre ninguna variante probada**: ni `eval(formula)` con una variable simple, ni
`eval(req.body.formula)` inline, ni `eval(x + y)` con concatenación explícita, ni siquiera
`eval(userInput)` en un módulo suelto sin ningún framework alrededor. Su nombre sugiere que
cubre exactamente este caso — "eval con una expresión, no un literal" — y sin embargo no
disparó en ocho variantes distintas.

**Quien detecta VULN-03 es una regla de nombre engañoso.**
`javascript.lang.security.audit.code-string-concat.code-string-concat` suena, por el id, a una
regla sobre concatenación de cadenas. No lo es: es una regla de **taint tracking** ("Found
data from an Express or Next web request flowing to `eval`"), con `precision: very-high` en su
metadata, que sigue el flujo `req.body.formula → formula → eval(formula)` sin que la
concatenación tenga nada que ver. El nombre es un residuo histórico de una versión anterior de
la regla; el comportamiento actual es taint-mode puro. Esto es la misma lección de VULN-02 por
otro ángulo: **el nombre de una regla no es una especificación de lo que hace.**

Comparación con las otras ~14 reglas de "eval" cargadas en el pipeline
(`ajinabraham.njsscan.eval.*`, la familia de njsscan): ninguna de ellas cubre este caso —
apuntan a patrones específicos (`vm2`, deserialización YAML, gRPC inseguro, plantillas SSTI),
no a "un `eval()` genérico con dato de request". La única red que atrapó VULN-03 es la regla
de taint de `p/javascript`.

### Por qué esto es más robusto que VULN-01 y VULN-02, no menos

A diferencia de las dos vulnerabilidades anteriores, aquí **no hubo que elegir con cuidado la
sintaxis** para que algún escáner la viera — el código se escribió de la forma más natural
posible (`eval(formula)`, variable simple, sin ningún intento de camuflar ni de exhibir la
vulnerabilidad) y una regla de taint la encontró de todos modos. Eso es justamente lo que se
espera de un análisis de flujo de datos bien construido: no depende de que el atacante (o quien
introduce la vulnerabilidad a propósito) use el nombre "correcto" para una variable o el
especificador "correcto" para un import. La lección no es "cuidado con cómo escribís esto" —
es que **el nombre de la regla que promete cubrir un caso no es garantía de que lo cubra, y el
que sí lo cubre puede no ser el que suena más específico.**

### Predicción para CodeQL (pendiente de confirmar en CI)

No se pudo ejecutar CodeQL en local (sin Docker en esta máquina). La predicción de
[`README.md`](README.md) §2 es ✅ `js/code-injection`, y el razonamiento es el mismo que dio
buen resultado en VULN-01: hay un flujo de taint **directo**, sin saltos ni indirecciones —
`req.body.formula` (fuente remota reconocida) hasta `eval()` (sink de ejecución de código
conocido), con una sola asignación intermedia. Es la forma de mayor precisión para esa
consulta. Si no dispara, la corrección de esta predicción es, como siempre en este proyecto,
el hallazgo — no un fracaso.

## 5. Tests

`backend/tests/integration/scoring.test.js` cubre el uso legítimo (fórmulas aritméticas,
rechazo de fórmula ausente o no numérica) y un bloque separado que afirma el comportamiento
**vulnerable**: ejecución de una IIFE con efecto secundario (prueba de que corre JS arbitrario,
no sólo aritmética), lectura de `process.env` desde dentro de la fórmula, acceso a globals de
Node fuera de las tres variables documentadas, y evaluación de **sentencias** (`let`, bucles)
en vez de sólo expresiones — cuatro pruebas de que no hay ninguna restricción de gramática.

Ninguno de los payloads de test toca el sistema de archivos ni lanza procesos: leen
`globalThis`/`process.env` del propio proceso de test, para que la suite sea segura de correr
en cualquier runner sin pensarlo dos veces. Los payloads de filesystem/red del §2 de este
documento son ilustrativos del impacto real, no parte de la suite automatizada.

Si esos tests fallan alguna vez, no hay que relajar la aserción: significa que alguien
corrigió VULN-03, y entonces corresponde retirarla del inventario y borrar ese bloque.

## 6. Alcance

La vulnerabilidad está contenida en un controller y una ruta nuevos. No toca el flujo de
`/api/scan/*`, `scanService.js`, ninguna fuente externa, ni el frontend — que ni siquiera
consume este endpoint. `BASELINE_SCORES` es un valor fijo dentro del propio archivo, sin
depender de `historyRepository` ni de ningún estado compartido con el resto de la app. El
resto de la línea base sigue limpio.

**No ejercitar este endpoint contra nada que no sea el propio proceso de prueba.** A
diferencia de VULN-01 y VULN-02, aquí no hace falta ni modo real ni red: la ejecución ocurre
en el propio proceso Node del servidor en cuanto `eval()` corre, sin tocar ninguna fuente
externa. El único cuidado real es no apuntar los payloads de `readFileSync`/`fetch` del §2 a
nada más allá de `127.0.0.1` y el propio checkout — igual que con cualquier otra RCE de este
inventario.
