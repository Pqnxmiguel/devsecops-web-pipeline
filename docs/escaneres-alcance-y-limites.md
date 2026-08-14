# Alcance y límites de los escáneres

Qué hace cada escáner del pipeline, cómo está configurado **en este repositorio**, y —lo
importante— **qué se le escapa y por qué**.

Este documento es el resultado del proyecto, no su documentación técnica. La pregunta no es
"¿detectaron la vulnerabilidad?" sino **"¿qué clase de vulnerabilidad no puede detectar
esta herramienta, hagamos lo que hagamos?"**.

> Complemento: [`estrategia-de-cobertura.md`](estrategia-de-cobertura.md) responde qué poner
> encima para cubrir estos huecos.

---

## Resumen

| | CodeQL | Semgrep | npm audit |
|---|---|---|---|
| Tipo | SAST | SAST | SCA |
| Analiza | Grafo semántico del código | AST (forma del código) | `package-lock.json` |
| Seguimiento de datos | ✅ **entre archivos** | ⚠️ intra-archivo (OSS) | ❌ |
| Depende de | Modelos escritos a mano | Patrones escritos a mano | Advisories publicados |
| Falla cuando | El modelo no cubre tu caso | Cambia la sintaxis | No hay advisory todavía |
| Velocidad | Lenta (minutos) | Rápida (segundos) | Instantánea |

**Los tres comparten un límite y conviene decirlo de entrada: detectan la _presencia_ de
patrones peligrosos, no la _ausencia_ de controles, ni la lógica de negocio.**

---

## CodeQL

### Qué hace

Compila el código a una **base de datos relacional** (expresiones, funciones, llamadas, flujo
de control) y ejecuta consultas en QL sobre ella. Su técnica central es el **taint tracking**:
seguir un dato desde una *source* (entrada controlada por el atacante) hasta un *sink* (lugar
peligroso), atravesando funciones y archivos.

Sources y sinks **no los infiere**: están escritos a mano en sus librerías (`NodeJSLib.qll`
y compañía), que viajan compiladas dentro de la acción. No consulta nada en tiempo de
ejecución.

### Configuración aquí

```yaml
languages: javascript-typescript
build-mode: none          # JS/TS no se compila; analiza el fuente directo
queries: security-extended
```

Con `paths` como **allowlist** (`backend`, `frontend`) y `paths-ignore` para
`node_modules`, `dist`, `coverage` y tests. `security-extended` añade consultas de menor
precisión al set por defecto: más cobertura a cambio de más falsos positivos.

Línea base: **0 hallazgos**.

### Qué se le escapa

**1. Lógica de negocio y autorización.** El hueco más grande y sin solución por SAST.

```js
router.get('/api/orders/:id', async (req, res) => {
  const order = await db.findOrder(req.params.id);
  res.json(order);          // ¿es este pedido DEL usuario que pregunta?
});
```

Sintaxis impecable, sin sink peligroso, y cualquiera lee los pedidos de cualquiera cambiando
el ID (IDOR, CWE-639). Quién *debería* poder ver qué no está escrito en el código.

**2. Sources y sinks no modelados.** Si el dato entra por una cola de mensajes, un WebSocket
o un framework poco común, el origen no queda marcado como remoto y **el flujo entero se
vuelve invisible**.

**3. Un saneador que no sanea.** El más peligroso, porque convierte una vulnerabilidad real
en silencio:

```js
function limpiar(x) { return x.replace(/;/g, ''); }   // sólo quita ';'
exec(`nslookup ${limpiar(domain)}`);
```

CodeQL puede tratar `limpiar()` como **barrera** y descartar el flujo. Verde en CI, y
`$(whoami)` o `&&` siguen funcionando. Peor que no escanear: genera confianza falsa.

**4. La ausencia de controles.** Es `VULN-05` (CWE-770). `js/missing-rate-limiting` existe,
pero sólo dispara si el handler hace algo "caro" según su modelo —filesystem, base de datos,
`exec`, o un chequeo de autorización—. **Una llamada HTTP saliente no está en esa lista**, y
en modo mock la ruta ni siquiera toca disco.

**5. Código dinámico.** `obj[calculado]()`, `new Function(...)`, metaprogramación: el grafo
se rompe donde no se puede resolver a qué apunta.

**6. Lo que no es código de aplicación.** Configuración e infraestructura (eso es el repo
hermano de IaC), secretos que viven en variables de entorno, dependencias, y **todo lo que
quede fuera del allowlist de `paths`**.

**7. Lo que sólo existe en ejecución.** Cabeceras HTTP reales, orden de middlewares, TLS,
sesiones, un endpoint expuesto por una regla de proxy. Ahí entra DAST, que es otra categoría.

---

## Semgrep

### Qué hace

Empareja **patrones sobre el AST**. Las reglas son YAML y se escriben con la forma del código
que buscan, con metavariables (`$X`) en lugar de nombres concretos: entiende estructura, no
texto, así que le da igual el formato o los nombres de variable.

Dos modos: `search` (¿existe este patrón?) y `taint` (¿fluye de aquí a allá?).

**Su límite de alcance es estructural: el taint de la versión OSS es intra-archivo, y por
defecto intra-función.** El análisis entre archivos existe pero es de la versión de pago. Esa
es la diferencia real con CodeQL, y la razón de tener los dos.

### Configuración aquí

Seis packs del registry más una regla suelta:

```
p/javascript  p/typescript  p/react  p/nodejs  p/nodejsscan  p/secrets
r/javascript.lang.security.detect-child-process
```

Tamaños medidos: `p/nodejsscan` 113 reglas, `p/javascript` y `p/typescript` 74 cada uno,
`p/secrets` 52, `p/nodejs` 36, y **`p/react` sólo 4**. Tras deduplicar y filtrar por
lenguaje, el run efectivo es de **224 reglas sobre 93 archivos**.

Un `p/` es una colección; un `r/` es una regla individual **del mismo catálogo público**.
Ninguna es nuestra.

> **Los packs no están congelados.** La línea base de seis packs corría 222 reglas; el run
> siguiente, con una regla suelta añadida, corrió 224. La diferencia no es de uno: la
> comunidad añadió otra por debajo, sin que nadie tocara la configuración. Es el mismo
> fenómeno que el advisory de `nanoid` descrito más abajo, pero en la capa de reglas: **la
> configuración es estable, el comportamiento no.** Por eso el conteo de reglas es un dato
> que conviene mirar en cada run, no una constante.

Línea base: **0 bloqueantes**, 7 informativos (`good_helmet_checks` de njsscan, que
confirman que Helmet está bien configurado — no son vulnerabilidades).

### Qué se le escapa

**1. Variantes sintácticas de la misma vulnerabilidad.** Este es *el* límite de Semgrep, y lo
demostró VULN-01: dos códigos idénticos en comportamiento y riesgo se detectan o no según
detalles de escritura sin ninguna relación con la seguridad. Detalle completo en
[`vulnerabilities/VULN-01.md`](vulnerabilities/VULN-01.md) §4.

**2. Flujos entre archivos.** Si la entrada se recoge en `routes/` y el sink está en
`services/`, el taint de la versión OSS no cruza. CodeQL sí.

**3. Un pack no es un catálogo.** Descubierto en VULN-01: la regla que detecta inyección de
comandos en ESM **existe en el registry pero no viene en ninguno de los seis packs**. Quien
asuma "instalé `p/javascript`, ya cubro JavaScript" se pierde reglas que existen y son
gratis.

**4. Cobertura muy desigual por pack.** `p/react` tiene 4 reglas. Eso no es "React está
cubierto", es "hay cuatro cosas de React que alguien escribió".

**5. Lo mismo que CodeQL en lo estructural:** lógica de negocio, ausencia de controles,
runtime y configuración.

### Un modo de fallo aparte: el escáner mal configurado no grita

`p/express` no existe (HTTP 404). Semgrep **continuó y habría terminado en verde** con un
pack menos cargado. Lo cazó un guard del propio pipeline, que revienta si el SARIF trae
errores de ejecución:

```bash
ERRORS=$(jq '[.runs[].invocations[]?.toolExecutionNotifications[]? | select(.level=="error")] | length' semgrep-results.sarif)
[ "$ERRORS" != "0" ] && exit 1
```

Y un segundo caso peor: Semgrep **omite `level` en cada resultado** — vive en
`defaultConfiguration.level` de cada regla. El gate original contaba resultados por `.level`
y por eso contaba siempre 0: cargaba 129 reglas `error` y no bloqueaba nada. Se corrigió
resolviendo el nivel contra la tabla de reglas, con `warning` como valor por defecto.

> **Un pipeline verde no significa código seguro. Puede significar un escáner roto.**
> Todo gate debe verificar que la herramienta *corrió*, no sólo que no devolvió hallazgos.

---

## npm audit

### Qué hace

Lee `package-lock.json`, resuelve el árbol completo de dependencias —incluidas las
transitivas— y consulta cada `paquete@versión` contra la **GitHub Advisory Database**.

**No analiza código en ningún momento.** Es una comparación de metadatos.

### Configuración aquí

Matriz sobre `backend/` y `frontend/`, con gate en `critical + high`. Un advisory `moderate`
se reporta pero **no bloquea**. Línea base: **0 / 0**.

Hay un guard explícito contra el falso negativo silencioso, porque `npm audit` devuelve
código de salida distinto de cero cuando encuentra algo y la combinación `|| true` + `// 0`
hacía que un JSON de error se leyera como "0 vulnerabilidades":

```bash
jq -e '.metadata.vulnerabilities' audit.json > /dev/null || exit 1
```

### Qué se le escapa

**1. Si no hay advisory publicado, la vulnerabilidad no existe para él.** Un paquete
comprometido hoy cuyo advisory se publica en tres semanas: durante tres semanas, verde. Es
un sistema reactivo por diseño.

> **Ocurrió en este repositorio, y conviene registrarlo.** La rama que añadió la regla de
> Semgrep a `main` sólo tocaba `app-ci.yml`, y aun así `npm audit` falló en backend **y**
> frontend: `nanoid <3.3.18` (GHSA-2v37-7h3g-55p8, *high*), una dependencia transitiva.
>
> Nadie tocó una dependencia. El código era idéntico al de la línea base 0/0. **Lo que
> cambió fue la base de advisories.** Esa es la naturaleza reactiva del SCA en una frase:
> el mismo commit es seguro un día e inseguro al siguiente, sin que el commit cambie.
>
> Corolario práctico: **un resultado de SCA caduca.** Un SAST verde sigue siendo válido
> mañana; un SCA verde sólo dice "no había advisory conocido en ese momento". Es la razón
> de que el escaneo de dependencias tenga que ser recurrente y no sólo por commit.

**2. No hay análisis de alcanzabilidad — en los dos sentidos.** Un CVE en una función que tu
código nunca llama bloquea el pipeline igual (ruido). Y al revés: nunca te dice si el CVE es
realmente explotable en tu uso concreto.

**3. Sólo ve lo que está en el lockfile.** Código copiado a mano, un CDN en un `<script>`,
un binario del sistema: invisibles.

**4. Cero sobre tu propio código.** Es SCA, no SAST. Una inyección SQL escrita por vos no le
concierne.

**5. Depende de que el lockfile esté sincronizado.** Si `package.json` y `package-lock.json`
divergen, `npm ci` falla antes de llegar al escaneo.

---

## Conclusión

Los tres escáneres son **complementarios, no redundantes**, y por razones distintas:

- **Semgrep falla si cambiás la forma.**
- **CodeQL falla si el problema no está en la forma en absoluto** — si vive en la intención,
  en la configuración, o en un modelo que su librería no tiene.
- **npm audit falla si nadie publicó el advisory todavía.**

Y los tres juntos siguen dejando fuera lo mismo: **lógica de negocio, autorización, ausencia
de controles y comportamiento en ejecución**. Eso no se arregla configurando mejor. Se
arregla poniendo otra cosa encima —
ver [`estrategia-de-cobertura.md`](estrategia-de-cobertura.md).
