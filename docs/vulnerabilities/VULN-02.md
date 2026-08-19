# VULN-02 — Credencial embebida en el código fuente (CWE-798)

| | |
|---|---|
| **CWE** | [CWE-798](https://cwe.mitre.org/data/definitions/798.html) — Use of Hard-coded Credentials |
| **Severidad** | Alta |
| **Ubicación** | `backend/src/controllers/enrichmentController.js` (constante `URLHAUS_ENRICHMENT_API_KEY`) |
| **Endpoint** | `POST /api/enrich/payload` |
| **Ruta** | `backend/src/routes/index.js` — registrada con validación completa, a propósito |
| **Detección esperada** | Semgrep (`p/secrets`, regla genérica de API key). CodeQL improbable (`js/hardcoded-credentials`) |
| **Detección real** | _pendiente — se completa con el resultado del run de CI_ |

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

## 4. Detección: el literal decide si se ve

Misma lección que VULN-01, por otro camino: **la forma del valor decide si un escáner lo
reconoce, con independencia de que sea o no una credencial de verdad.**

Las reglas genéricas de secretos (las de `p/secrets`, portadas de gitleaks) no entienden qué
es una credencial. Hacen tres cosas:

1. Buscan un **nombre** cerca del literal que suene a secreto (`key`, `api`, `token`,
   `secret`, `auth`, `password`).
2. Comprueban que el **valor** encaje en una clase de caracteres y una longitud plausibles.
3. Miden la **entropía** del literal, para descartar `"changeme"` y `"TODO"`.

De ahí la decisión deliberada del código, comentada en el propio archivo: el literal **no
lleva marcas tipo `FAKE`, `EXAMPLE` o `DUMMY` dentro del valor**. Esas palabras están en las
listas de descarte de las reglas genéricas — un secreto que se anuncia como falso es
exactamente lo que esas reglas están diseñadas para ignorar. Con `FAKE_KEY_…` la
vulnerabilidad sería idéntica y **ningún escáner la vería**. La marca de "esto es de mentira"
va en el comentario y en este documento, no en el valor.

El otro lado de la misma moneda es la restricción de §3 de
[`README.md`](README.md): si el literal se pareciera al patrón de un proveedor reconocido,
**push protection rechazaría el push** y el pipeline no llegaría a correr. El valor tiene que
caer en la franja intermedia: suficiente entropía para que la regla genérica lo vea, ningún
prefijo ni formato de proveedor real para que GitHub lo deje pasar.

Predicción para este código:

- **Semgrep** — la regla genérica de API key de `p/secrets` debería disparar sobre la
  asignación: nombre `…_API_KEY`, 32 caracteres alfanuméricos, entropía alta. Es la detección
  esperada, y también la frágil: `p/secrets` es un pack grande y cambiante, y el umbral de
  entropía no está documentado.
- **CodeQL** — `js/hardcoded-credentials` existe en `security-extended`, pero exige que el
  literal llegue a una posición que su modelo reconozca como credencial. Aquí el valor se pasa
  como propiedad `'Auth-Key'` de un objeto de cabeceras, no como argumento de una API de
  autenticación conocida. La predicción de [`README.md`](README.md) §2 dice ❌; si dispara,
  la predicción se corrige y eso es el hallazgo.
- **njsscan** (`p/nodejsscan`) — no tiene reglas de secretos genéricos para JS; no se espera
  nada por ahí.

Si Semgrep tampoco dispara, el resultado sigue siendo publicable y es el más incómodo de los
tres: **una credencial real, en código, en un repo público, y cuatro escáneres en verde.**
Documentarlo es más valioso que retocar el literal hasta que alguien lo vea.

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
