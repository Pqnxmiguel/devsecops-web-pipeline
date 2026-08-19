# VULN-02 — Credencial embebida en el código fuente (CWE-798)

| | |
|---|---|
| **CWE** | [CWE-798](https://cwe.mitre.org/data/definitions/798.html) — Use of Hard-coded Credentials |
| **Severidad** | Alta |
| **Ubicación** | `backend/src/controllers/enrichmentController.js` (constante `URLHAUS_ENRICHMENT_API_KEY`) |
| **Endpoint** | `POST /api/enrich/payload` |
| **Ruta** | `backend/src/routes/index.js` — registrada con validación completa, a propósito |
| **Detección esperada** | Semgrep — `ajinabraham.njsscan.generic.hardcoded_secrets.node_api_key` (`p/nodejsscan`, `error`). CodeQL improbable (`js/hardcoded-credentials`) |
| **Detección real** | Semgrep ✅ confirmado en corrida local (§4); CodeQL _pendiente del run de CI_ |

---

## 1. El defecto

El endpoint de enriquecimiento consulta la API de payloads de abuse.ch y se autentica con
una `Auth-Key`. Esa credencial **está escrita en el código**:

```js
const URLHAUS_ENRICHMENT_API_KEY = 'Rk7Qm2Xz9Lb4Nv6Ht1Ws8Jc5Pd3Ty0Gu';
…
headers: { 'Auth-Key': URLHAUS_ENRICHMENT_API_KEY },
```

Lo que hace interesante a esta vulnerabilidad en este repo es el **contraste**: el backend ya
consume el mismo proveedor por el camino correcto. `services/sources/urlhaus.js` recibe su
`authKey` como dependencia, y `config/index.js` la lee de `URLHAUS_AUTH_KEY` con
`readRequiredSecret`/entorno. Dos rutas hacia abuse.ch, una bien y otra mal — la vulnerable
es la que se saltó la capa de configuración que ya existía.

Por qué una credencial en el código es un defecto y no un atajo:

1. **Se distribuye con el código.** Viaja en cada clon, cada fork y cada rama. En un repo
   público como éste, publicarla es publicarla: no hay control de acceso que la proteja.
2. **Sobrevive al borrado.** Quitarla del archivo no la saca del historial de git. Quien
   tenga el repo la recupera con `git log -p`. La única remediación real es **rotar la
   credencial en el proveedor**.
3. **Rotarla exige desplegar.** Cambiar la key es un cambio de código, con build y despliegue,
   en vez de una variable de entorno. En una fuga real, esa fricción se traduce en horas de
   exposición extra.
4. **No se puede diferenciar por entorno.** Desarrollo, CI y producción comparten la misma
   credencial, así que cualquiera con acceso a un entorno la tiene para todos.

## 2. Explotación

No hace falta atacar el servicio: la credencial se lee del repositorio.

```bash
git clone https://github.com/Pqnxmiguel/devsecops-web-pipeline
grep -rn "Auth-Key" devsecops-web-pipeline/backend/src/
```

Y aunque alguien la borre en un commit posterior, sigue ahí:

```bash
git log -p -S 'URLHAUS_ENRICHMENT_API_KEY' -- backend/src/controllers/enrichmentController.js
```

**Impacto:** quien la obtenga consume la cuota del proveedor a nombre del operador, y en un
servicio con más superficie que abuse.ch (una key de pago, un bucket, un webhook) accede
directamente a los datos que esa credencial protege. La víctima no ve un ataque: ve su cuota
agotada o su factura subir.

**Lo que NO es alcanzable, y conviene saberlo:** esta vulnerabilidad no da acceso al servidor
ni a la máquina. No hay ejecución, no hay lectura de archivos, no hay escalada. Es un fallo de
**confidencialidad de un secreto**, no de control del sistema — y por eso mismo tampoco se
"explota" contra el endpoint: el endpoint funciona exactamente como debería. El daño lo hace
la publicación del valor.

En este repo la credencial es una cadena aleatoria generada para la demo: no autentica contra
abuse.ch ni contra ningún otro proveedor, y no comparte formato con ninguna key real del
operador (ver la auditoría de fugas en [`handoff.md`](../../handoff.md) §3).

## 3. El fix correcto

```js
export function createEnrichmentController({ config, fetchJson = defaultFetchJson }) {
  …
  headers: config.urlhausAuthKey ? { 'Auth-Key': config.urlhausAuthKey } : {},
}
```

y en `app.js` el controller ya recibe `config`, así que no hay nada más que cablear.

Tres pasos, en orden de importancia:

1. **Rotar la credencial expuesta.** Primero, antes de tocar el código. Borrarla del archivo
   no la invalida; sigue viva en el historial y en cada clon.
2. **Leerla de configuración**, igual que `createUrlhausSource`. El repo ya tiene el
   mecanismo (`config/index.js`), la validación de arranque (`readRequiredSecret`) y el
   `.env.example` documentado: la vulnerabilidad fue no usarlos.
3. **Cerrar la puerta para la próxima.** Secret scanning y push protection ya están activos
   en el repo; un escaneo de secretos en CI (aquí, `p/secrets` de Semgrep) es la red que
   atrapa lo que se escribe a mano.

## 4. Detección: el NOMBRE decide si se ve, no el valor

Misma lección que VULN-01 por otro camino, pero la predicción inicial de esta ficha era
**falsa en tres puntos**, y la corrección es más interesante que la predicción. Todo lo que
sigue está **medido**: se ejecutó la configuración literal del job `sast-semgrep`
(Semgrep 1.172.0 pineado, los seis packs, la regla suelta y la misma exclusión) sobre esta
rama, antes de pushearla.

Resultado real:

```
error  ajinabraham.njsscan.generic.hardcoded_secrets.node_api_key
       backend/src/controllers/enrichmentController.js:53
```

Un bloqueante. El job falla y Discord reporta. Pero:

**1. `p/secrets` no la detecta — aportó cero hallazgos.** La predicción decía que la vería la
"regla genérica de API key" de ese pack. Esa regla **no está en el pack**: `p/secrets`, tal
como lo resuelve el registry hoy, son ~52 reglas de **patrón de proveedor concreto** (AWS,
Stripe, Slack, Telegram, Twilio, Mailgun, Heroku, npm, Google, PayPal, SonarQube…) más
reglas de JWT hardcodeado ligadas a librerías (`jsonwebtoken`, `jose`, `express-session`).
Ninguna regla genérica de entropía. Es el mismo hallazgo de fondo que dio VULN-01 desde otro
ángulo: **el nombre de un pack describe una intención, no un catálogo.** Si el secreto no es
de un proveedor de la lista, `p/secrets` no lo ve.

**2. Quien la detecta es njsscan**, el pack del que esta ficha decía "no tiene reglas de
secretos genéricos para JS; no se espera nada por ahí". Es justo al revés: es el único que
la ve, con severidad `error`.

**3. El literal es irrelevante para la detección.** La justificación original —no poner
`FAKE`/`EXAMPLE` dentro del valor porque las reglas descartan por lista de palabras— es
falsa para la regla que realmente dispara. `node_api_key` es, en esencia:

```yaml
pattern: $X = '...'
pattern-not: $X = ''
metavariable-regex:  $X:  (?i).*(api_key|apikey)
```

No hay umbral de entropía, ni longitud mínima, ni lista de descarte. Comprobado
empíricamente: con el valor `'FAKE_KEY_NO_REAL_…'` la regla **dispara igual**, y hasta
`const X_APIKEY = 'short'` dispara.

**La fragilidad real está en el identificador.** Medido sobre variantes con la misma config:

| Variante | ¿Detectada? |
|---|---|
| `const URLHAUS_ENRICHMENT_API_KEY = 'Rk7Qm2…'` (la actual) | ✅ |
| `const …_API_KEY = 'FAKE_KEY_NO_REAL_…'` | ✅ |
| `const …_APIKEY = 'short'` | ✅ |
| `const …_AUTH_KEY = 'Rk7Qm2…'` | ❌ |
| `{ 'Auth-Key': 'Rk7Qm2…' }` inline, sin constante | ❌ |

Es decir: **si alguien renombra la constante a `URLHAUS_ENRICHMENT_AUTH_KEY` —el nombre
natural, porque la cabecera se llama `Auth-Key` y la variable de entorno hermana es
`URLHAUS_AUTH_KEY`— la vulnerabilidad queda idéntica y el pipeline pasa en verde.** Por eso
el código lleva un aviso explícito de no renombrarla. Dos vulnerabilidades con el mismo
riesgo se detectan o no según cómo se llame una variable: un SAST no razona sobre semántica,
empareja patrones.

Lo que sí sigue siendo correcto del literal, por otra razón: no lleva prefijo ni formato de
proveedor reconocido, porque si lo llevara **push protection rechazaría el push** de la rama
y el pipeline no llegaría a escanear nada (restricción de §3 de [`README.md`](README.md)).
Y no lleva marcas `FAKE`/`EXAMPLE` porque una demo con un valor realista es más honesta y no
queda a merced de las listas de descarte que otras reglas sí tienen — pero eso es criterio,
no una condición de detección.

Pendiente de confirmar en CI:

- **CodeQL** — `js/hardcoded-credentials` existe en `security-extended`, pero exige que el
  literal llegue a una posición que su modelo reconozca como credencial. Aquí el valor se pasa
  como propiedad `'Auth-Key'` de un objeto de cabeceras, no como argumento de una API de
  autenticación conocida. La predicción de [`README.md`](README.md) §2 dice ❌; si dispara,
  la predicción se corrige y eso es el hallazgo.

## 5. Tests

`backend/tests/integration/enrichment.test.js` afirma el comportamiento **vulnerable** sin
copiar el secreto a un segundo archivo: comprueba que la `Auth-Key` saliente **no depende de
la configuración** (es la misma con dos configs distintas, y distinta de la que se le pasa por
entorno). Esa es exactamente la propiedad que define CWE-798.

El resto del archivo cubre el endpoint como cualquier otro: validación del hash, elección del
campo según el algoritmo, normalización de la respuesta y la garantía de que en modo mock
**no sale ninguna petición de red**.

Si esos tests fallan alguna vez, no hay que relajar la aserción: significa que alguien
corrigió VULN-02, y entonces corresponde retirarla del inventario y borrar ese bloque.

## 6. Alcance

La vulnerabilidad está contenida en un controller y una ruta nuevos. No toca el flujo de
`/api/scan/*`, ni la fuente `urlhaus.js` (que sigue leyendo su key de configuración), ni
`config/index.js`, ni el frontend — que ni siquiera consume este endpoint. La ruta **sí**
valida su entrada, a diferencia de la de VULN-01: VULN-02 es CWE-798 y nada más, para que el
hallazgo del escáner no se confunda con otro defecto. El resto de la línea base sigue limpio.

**No ejercitar este endpoint con `USE_MOCK_SOURCES=false`.** El `.env` local del operador lo
tiene en `false` (modo real, ya probado end-to-end contra las APIs de verdad), y desde el fix
registrado en [`handoff.md`](../../handoff.md) §3 los scripts `dev`/`start` sí cargan ese
archivo. Con esta rama en checkout, un `npm run dev` seguido de un `POST /api/enrich/payload`
**enviaría la Auth-Key falsa a `urlhaus-api.abuse.ch` desde la IP del operador**. No expone
nada —la credencial es inventada y abuse.ch devolvería 401— pero contradice la regla de
`CLAUDE.md` de que una vulnerabilidad intencional nunca corre contra un servicio real, y
repetirlo puede hacer que abuse.ch marque la IP. Para probar el endpoint a mano:
`USE_MOCK_SOURCES=true npm run dev`. Los tests no incurren en esto: fuerzan modo mock, y uno
de ellos espía `globalThis.fetch` para probar que no sale ninguna petición.

Semgrep es estático: la detección no depende de que la rama real sea alcanzable. Se dejó el
código de la llamada intacto —en vez de cortarlo con un 501 en modo real— porque es lo que
hace legible la vulnerabilidad: sin él, no se ve para qué sirve la credencial.
