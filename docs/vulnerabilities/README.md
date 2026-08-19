# Vulnerabilidades intencionales — mapa de cobertura

Este directorio documenta las 8 vulnerabilidades intencionales del proyecto. Cada una
tendrá su propio `VULN-NN.md` a medida que se introduzca.

El **inventario canónico** (qué es cada VULN-NN) vive en
[`.claude/agents/appsec-reviewer.md`](../../.claude/agents/appsec-reviewer.md).
Este documento responde una pregunta distinta y complementaria:

> ¿Qué escáner detecta realmente cada una — y cuáles no detecta nadie?

Ese mapa es el resultado más valioso del proyecto. Un escáner que **no** detecta una
vulnerabilidad que sabemos que está ahí enseña más que uno que la detecta.

---

## 1. Estado: VULN-01, VULN-02 y VULN-03 introducidas, cada una en su rama; VULN-04…08 pendientes

`main` sigue siendo la **línea base limpia** (sin vulnerabilidades), verificada en CI:

| Escáner | Resultado sobre la línea base | Verificado |
|---|---|---|
| CodeQL (`security-extended`) | 0 hallazgos | ✅ run en `main` |
| Semgrep (224 reglas, 93 archivos) | 0 bloqueantes, 7 informativos | ✅ run en `main` |
| npm audit (backend / frontend) | 0 / 0 vulnerabilidades | ✅ run en `main` |
| Notificación a Discord | entregada (HTTP 204) | ✅ run en `main` |

Los 7 informativos son reglas `good_helmet_checks` de njsscan: **no son vulnerabilidades**,
son confirmaciones de que Helmet está bien configurado. Aparecen en Code Scanning como
`note` y no bloquean. (La línea base original fueron 222 reglas; son 224 desde que se sumó la
regla suelta de inyección de comandos — ver la fila 01 de §2 y
[`../escaneres-alcance-y-limites.md`](../escaneres-alcance-y-limites.md).)

**Que la línea base esté en verde es el requisito para que todo lo demás signifique algo.**
Si el pipeline reportara ruido sobre código limpio, ninguna VULN-NN posterior sería
distinguible de ese ruido.

**VULN-01 (CWE-78) ya está introducida** en la rama `vuln/VULN-01-command-injection` (su
análisis, `VULN-01.md`, vive en esa rama; el runbook de explotación se mantiene local y sin
versionar porque contiene rutas de la máquina). En el run de la rama, **CodeQL y Semgrep la
detectaron y bloquearon** en la llamada a `exec` de `diagnosticsController.js` — confirmando
la predicción de la fila 01 de §2.

**VULN-02 (CWE-798) está introducida** en la rama `vuln/VULN-02-hardcoded-api-key`: una
`Auth-Key` de abuse.ch escrita en `enrichmentController.js` en vez de leerse de configuración.
Sólo Semgrep la detectó, y no con la regla predicha — ver `VULN-02.md` en esa rama.

**VULN-03 (CWE-95) está introducida** en la rama `vuln/VULN-03-eval-injection`: un `eval()`
sobre una fórmula de puntuación en `scoringController.js`
(`POST /api/score/custom`). Medido en local antes de pushear: Semgrep bloquea, pero con
`javascript.lang.security.audit.code-string-concat.code-string-concat` — no con la
`detect-eval-with-expression` que predecía la fila 03 de §2, que **no dispara sobre ninguna
variante probada**. CodeQL queda pendiente del run de CI. Análisis completo en `VULN-03.md`.

Cada rama diverge de `main` y no se mezcla de vuelta con las demás — este documento describe
un estado distinto según en qué rama se lea. Las correcciones de fila que siguen abajo son
propias de esta rama (VULN-03); las de VULN-01 y VULN-02 viven en sus branches respectivos y
no se traen aquí a propósito. Faltan VULN-04…08.

---

## 2. Mapa de cobertura previsto

> ⚠️ **Esto es una predicción, no un resultado.** Se basa en qué reglas y consultas existen
> realmente en los packs configurados y en qué requieren para dispararse — no en haberlas
> visto detectar estas vulnerabilidades, porque todavía no existen. **Cada fila se confirma
> o se corrige cuando su VULN-NN se introduce.** Las correcciones son el hallazgo, no un
> fracaso de la predicción.

| VULN | CWE | CodeQL | Semgrep | npm audit | ¿Bloquearía? |
|---|---|---|---|---|---|
| 01 | 78 — `exec()` con input | ✅ `js/command-line-injection` | ✅ `detect-child-process` | — | **Sí, doble** |
| 02 | 798 — API key hardcodeada | ❌ probable | ⚠️ depende del literal | — | Frágil |
| 03 | 95 — `eval()` sobre input | ✅ `js/code-injection` (sin confirmar) | ✅ **medido**, pero `code-string-concat` (taint), **no** `detect-eval-with-expression` — ver §2.1 | — | **Sí (Semgrep confirmado)** |
| 04 | 942 — CORS `*` | ❌ | ⚠️ `header_cors_star` (njsscan) | — | Depende de cómo se escriba |
| 05 | 770 — sin rate limiting | ⚠️ improbable | ❌ | — | **Probablemente NO** |
| 06 | — dependencia con CVE | — | — | ⚠️ solo si es high/critical | Condicional |
| 07 | 79 — `dangerouslySetInnerHTML` | ⚠️ requiere source modelado | ✅ `react-dangerouslysetinnerhtml` | — | **Sí (Semgrep)** |
| 08 | 200 — key en el bundle | ❌ | ⚠️ depende del literal | — | **Probablemente NO** |

### 2.1 — La fila 03 ya se corrigió: el nombre de una regla no es su especificación

La predicción original decía que `detect-eval-with-expression` detectaría VULN-03 — el nombre
sugiere exactamente ese caso ("eval con una expresión, no un literal"). Medido en local antes
de pushear: **esa regla no dispara**, ni siquiera en variantes triviales (`eval(x)`,
`eval(req.body.formula)` inline, `eval(x + y)` con concatenación explícita). Probado de forma
aislada contra ocho variantes distintas, cero hallazgos en todas.

Quien detecta VULN-03 es `javascript.lang.security.audit.code-string-concat.code-string-concat`
— una regla cuyo *id* sugiere "concatenación de cadenas" pero cuyo comportamiento real es
taint tracking puro: sigue el flujo `req.body.formula → formula → eval(formula)` sin que la
concatenación tenga nada que ver (`precision: very-high` en su propia metadata). El nombre es
un residuo de una versión anterior de la regla. Detalle completo, con las ocho variantes
probadas, en [`VULN-03.md`](VULN-03.md) §4.

Mismo tipo de hallazgo que la fila 02 (donde `p/secrets` prometía una regla genérica que no
existe, y quien detectaba de verdad era njsscan) — pero al revés: allí el pack equivocado no
tenía nada; aquí el pack correcto sí tiene una regla que cubre el caso, sólo que no es la que
su nombre hace pensar que es.

### VULN-05 es el hueco estructural, y es el hallazgo más interesante

Ningún escáner del pipeline detecta la **ausencia** de rate limiting. No es un problema de
configuración: es una limitación conceptual del SAST. Los escáneres detectan la *presencia*
de patrones peligrosos, no la *ausencia* de controles.

CodeQL sí tiene `js/missing-rate-limiting`, pero solo dispara si el handler hace algo
"caro" según su modelo: filesystem, base de datos, `exec`, o un chequeo de autorización.
**Una llamada HTTP saliente no está en esa lista.** Y en modo mock — que es el default —
la ruta `/api/scan/*` ni siquiera toca el disco.

Tres salidas posibles:
1. Ubicar VULN-05 en una ruta que además lea disco (`/api/quota` sí llega a `readFileSync`),
   para darle a CodeQL el "handler caro" que su modelo necesita.
2. Escribir una regla propia de Semgrep en `.semgrep/rules/` (gratis, se suma con otro
   `--config`).
3. **Dejarla sin detectar y documentarlo como resultado.** Recomendado: "introdujimos una
   vulnerabilidad real, CWE-770, y cuatro escáneres no la vieron, por esta razón
   estructural" es una conclusión más valiosa para una demo de DevSecOps que ocho
   semáforos en verde.

---

## 3. Restricciones al implementar cada VULN

Estas no son sugerencias de estilo: si se ignoran, la vulnerabilidad **no llega a
escanearse** o **no bloquea**, y la demostración se cae.

### VULN-02 y VULN-08 — el push puede quedar bloqueado antes del escaneo

**Secret scanning y push protection están activos en este repo.** Si el literal falso se
parece al patrón de un proveedor reconocido, GitHub **rechaza el push de la rama** y nunca
se llega a ejecutar el pipeline.

Ojo particular con VirusTotal: sus keys son 64 caracteres hex, un formato que además ya
aparece en `backend/src/services/sources/mocks/fixtureBucket.js`. Usar un literal
inequívocamente falso (`FAKE_KEY_NO_REAL_...`) que no matchee ningún patrón de proveedor.

Nunca usar las credenciales reales del operador — ver la auditoría de fugas en
[`handoff.md`](../../handoff.md).

### VULN-04 — la forma de escribirla decide si se detecta

Implementar con el paquete `cors`:

```js
app.use(cors({ origin: '*', credentials: true }));
```

y **no** con `res.setHeader('Access-Control-Allow-Origin', '*')` a mano. Las reglas de
`p/javascript` (`javascript.express.security.cors-misconfiguration`) y de `p/nodejsscan`
(`header_cors_star`) matchean sobre la configuración del paquete. A mano, la cobertura cae
mucho. Además, `credentials: true` la hace realmente explotable en vez de solo permisiva.

### VULN-06 — dos condiciones que hay que cumplir a mano

- **El advisory debe ser `high` o `critical`.** El gate de `npm audit` bloquea con
  `critical + high`; un advisory `moderate` se reporta pero **el job pasa en verde**.
- **Hay que regenerar `package-lock.json`.** Si se agrega la dependencia solo en
  `package.json`, `npm ci` falla con "lock file out of sync" antes de llegar al escaneo, y
  `npm audit` devuelve un JSON de error que el guard rechaza explícitamente.

### VULN-05 y VULN-04 rompen tests existentes

La línea base tiene tests que afirman el comportamiento correcto: VULN-05 rompe los que
verifican el 429 de rate limiting, y VULN-04 los de la whitelist de CORS. Eso es
**esperado** — pero hace que el job `build-test` falle, y el embed de Discord dirá
"🚨 se detectaron hallazgos" por una causa que no es un hallazgo de seguridad. Al
introducirlas, ajustar los tests en el mismo commit y decirlo en el mensaje.

---

## 4. Qué se registra cuando cada VULN se introduce

Cada `VULN-NN.md` debe contener:

- **CWE** y descripción del defecto.
- **Ubicación exacta** (archivo:línea) y su comentario `[VULN-INTENCIONAL: CWE-NNN]`.
- **Qué escáner la detectó realmente** — y cuál no, contrastado con la predicción de §2.
- **Explotabilidad**: escenario concreto, no teoría.
- **El fix correcto**, para que sirva como material didáctico.
- **Enlace al run de CI** donde se ve la detección y la alerta en Discord.
