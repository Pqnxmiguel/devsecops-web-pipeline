# Modelo de dominio — IOC Scanner (backend)

> Glosario y modelo de las entidades del backend. Escrito **antes** de implementar.
> Sin detalles de implementación: esto define el lenguaje ubicuo del proyecto, no la
> estructura de carpetas.

---

## 1. Vocabulario

| Término | Significado exacto en este proyecto |
|---|---|
| **IOC** (Indicator of Compromise) | El artefacto que el usuario quiere evaluar. Siempre tiene un **tipo discriminado** y un **valor normalizado**. No es "la consulta" ni "el resultado". |
| **Scan** | Un acto de consulta: *este IOC*, en *este instante*, contra *estas fuentes*, con *este veredicto*. Es un hecho histórico inmutable. |
| **Verdict** | El juicio agregado de un Scan: `clean` / `suspicious` / `malicious` / `unknown` + una confianza. `unknown` no es un juicio: es la declaración de que **no se pudo emitir uno**. |
| **Source** | Un proveedor de threat intelligence (AbuseIPDB, VirusTotal, URLhaus). |
| **SourceReport** | La respuesta de **una** Source ya **normalizada** al lenguaje del dominio. |
| **Normalización** | La traducción de la forma propia de cada Source al `SourceReport` común. Es el único lugar del sistema donde vive el conocimiento de la forma cruda de cada API. |

**Distinciones que se hacen explícitas** (términos que se confundirían fácil):

- **IOC ≠ Scan.** El mismo IOC puede escanearse muchas veces y dar veredictos distintos
  en el tiempo. El historial guarda Scans, no IOCs.
- **Verdict ≠ SourceReport.** Una Source emite un `SourceReport` (su opinión); el Scan
  emite un `Verdict` (la conclusión agregada). Con una sola fuente coinciden en nivel,
  pero son entidades distintas: mañana habrá dos fuentes por tipo y el Verdict será
  una agregación.
- **`score` ≠ `confidence`.** `score` es *cuán malicioso* (0–100). `confidence` es *cuánto
  respaldo* tiene ese juicio (0–1): cuántas fuentes respondieron y qué tan concluyentes
  fueron. Un IOC que las fuentes **conocen y no tienen reportado** es `clean` con
  confidence **baja**; una IP con 98 de abuso es `malicious` con confidence **alta**.
- **"Desconocido para la fuente" ≠ "la fuente no respondió".** Es la distinción que
  sostiene todo el §2.4. Que VirusTotal conteste *"no tengo registro de este hash"* es
  **información** (débil, pero real): la fuente respondió → `clean`, confidence 0.2. Que
  VirusTotal no conteste — timeout, 429, 5xx — **no es información de ninguna clase**:
  no hay observación que reportar → `unknown`. Colapsar las dos en `clean` fue el
  defecto corregido en el ADR 3.

---

## 2. Entidades

### 2.1 IOC

Unión discriminada por `type`. El valor se guarda **normalizado**, nunca como lo tecleó
el usuario.

```
IOC =
  | { type: "ip",     value: string, ipVersion: 4 | 6 }
  | { type: "hash",   value: string, algorithm: "md5" | "sha1" | "sha256" }
  | { type: "domain", value: string }
```

**Reglas de normalización (invariantes):**

| Tipo | Invariante |
|---|---|
| `ip` | `value` es una IP válida según el parser nativo de Node (`net.isIP`). `ipVersion` se deriva, no se pide al cliente. Se rechazan rangos/CIDR: un IOC es *una* dirección. |
| `hash` | `value` en minúsculas, solo `[0-9a-f]`. `algorithm` se **deriva de la longitud**: 32 → md5, 40 → sha1, 64 → sha256. Cualquier otra longitud es inválida. El cliente nunca declara el algoritmo (sería una fuente de contradicción). |
| `domain` | Minúsculas, sin punto final, sin esquema (`http://`) ni path ni puerto. Entre 1 y 253 caracteres. Cada etiqueta: 1–63 chars de `[a-z0-9-]`, sin empezar ni terminar en `-`. Mínimo dos etiquetas (se rechaza `localhost`). |

**Decisión — validación sin ReDoS:** ninguna de estas reglas se expresa con una regex
anidada con cuantificadores solapados. IP → `net.isIP` (parser nativo en C++). Dominio →
`split(".")` + comprobación lineal por etiqueta. Hash → comprobación de longitud
*antes* de una clase de caracteres plana (`^[0-9a-f]+$`, sin alternancia ni anidamiento,
por lo tanto sin backtracking catastrófico). Ver ADR 1.

### 2.2 Source

Las tres fuentes tienen **la misma interfaz** y difieren solo en qué tipos de IOC atienden
y en cómo normalizan.

```
Source = {
  id:       "abuseipdb" | "virustotal" | "urlhaus",
  supports: (iocType) -> boolean,
  lookup:   (IOC) -> Promise<SourceReport>
}
```

| Source | Atiende | Requiere API key | Forma cruda de su respuesta |
|---|---|---|---|
| AbuseIPDB | `ip` | sí (`ABUSEIPDB_API_KEY`) | `data.abuseConfidenceScore` 0–100, `totalReports`, `countryCode` |
| VirusTotal | `hash` | sí (`VIRUSTOTAL_API_KEY`) | `data.attributes.last_analysis_stats = { malicious, suspicious, harmless, undetected, timeout }` — **conteos por engine**, no un score |
| URLhaus | `domain` | no | `query_status` (`ok` / `no_results`), `urls[].url_status` (`online` / `offline`), `blacklists` |

**Mapeo tipo de IOC → Source** (uno a uno hoy; el modelo admite N):

```
ip     -> [abuseipdb]
hash   -> [virustotal]
domain -> [urlhaus]
```

### 2.3 SourceReport — la forma común

Es la salida de la capa de normalización. **Todo el resto del sistema habla solo este
lenguaje**; nadie fuera de `services/sources/` conoce `abuseConfidenceScore` ni
`last_analysis_stats`.

```
SourceReport = {
  source:     SourceId,
  level:      "clean" | "suspicious" | "malicious" | "unknown",
  score:      0..100 | null, // cuán malicioso, escala común. null ⟺ level = "unknown"
  confidence: 0..1,          // cuánto respaldo tiene esta lectura
  details:    { ... },       // resumen legible, ya traducido (nunca el payload crudo)
  queriedAt:  ISO-8601,
  degraded:   boolean        // true si la fuente falló y esto es un reporte de relleno
}
```

`degraded: true` es la respuesta a: *"¿qué pasa si VirusTotal está caído?"*. No se rompe
el Scan ni se inventa un veredicto: se emite un reporte degradado
(`level: "unknown"`, `score: null`, `confidence: 0`) y el Scan lo declara.

**Invariante del nivel en un SourceReport:** una fuente que **respondió** emite siempre
uno de los tres niveles de la escala; `unknown` es exclusivo del reporte de relleno. Las
dos condiciones van juntas y son redundantes a propósito:
`degraded === true ⟺ level === "unknown" ⟺ score === null`. El constructor de reportes
normales rechaza `unknown`, y el de reportes degradados es el único que lo produce; así
no existe ninguna forma de fabricar un reporte que parezca una respuesta sin serlo.

### 2.4 Verdict

```
Verdict = {
  level:      "clean" | "suspicious" | "malicious" | "unknown",
  score:      0..100 | null,   // null si y sólo si level = "unknown"
  confidence: 0..1,
  summary:    string           // una frase, apta para mostrar al usuario
}
```

**Los cuatro niveles no son una escala de cuatro puntos.** Tres de ellos —
`clean` < `suspicious` < `malicious` — están ordenados y anclados a las bandas de score
del §3.1. `unknown` está **fuera** de esa recta: significa *no concluyente*, no "el
extremo inocente". Consecuencias de diseño, todas obligatorias:

- `unknown` no tiene banda de score y no puede derivarse de un número.
- `unknown` **nunca** entra en la comparación de máximo de la agregación. No se compara
  con nada: se decide *antes*, por ausencia de evidencia.
- Cualquier código que ordene, compare o pinte por severidad debe tratar `unknown` como
  un caso explícito. Si lo mete en un `else` junto a `clean`, está reintroduciendo el
  fallo del ADR 3.

#### Regla de agregación de N SourceReports a un Verdict

Los reportes se parten en dos grupos. Un reporte es **concluyente** si `degraded !== true`
**y** su `level` está en la escala **y** su `score` es un número finito (tres condiciones
redundantes: cualquiera de ellas basta para excluir un relleno; van las tres para que
manipular una sola no abra el agujero).

1. **Cero reportes concluyentes** (todas las fuentes degradadas) →
   `level: "unknown"`, `score: null`, `confidence: 0`. **Nunca `clean`**, sea cual sea
   el número de fuentes consultadas.
2. **Al menos un reporte concluyente** → `score` = **máximo** de los `score`
   concluyentes (ADR 2) y `level` se deriva de ese score con las bandas del §3.1. Los
   reportes degradados **no arrastran el resultado ni hacia arriba ni hacia abajo**: no
   suman un 0 al máximo ni bajan el nivel.
3. `confidence` = (media de las `confidence` concluyentes) × (concluyentes / consultadas).
   Aquí es donde **sí** pesan las degradadas: una fuente caída no cambia el veredicto
   pero reduce su respaldo. Con todas degradadas la fórmula colapsa a 0, coherente con
   la regla 1.
4. Todos los reportes, degradados incluidos, siguen apareciendo en `sources[]` con su
   `degraded` y su `details.reason`. El veredicto resume; `sources[]` rinde cuentas.
5. Lista de reportes vacía → **error de programación**, lanza. No es un caso de dominio:
   un Verdict sin ningún reporte que agregar no debería poder construirse.

**Invariante verificado por test** (`verdict.test.js`, guarda anti-regresión de OBS-2),
enumerando todas las combinaciones de fuentes vivas/caídas hasta tres fuentes:

```
verdict.level === "clean"   ⟹  al menos un reporte concluyente
ningún reporte concluyente  ⟹  level = "unknown" ∧ score = null ∧ confidence = 0
```

#### Por qué `score: null` y no `score: 0`

`0` es un valor **medido**: significa "lo miramos y no hay nada". Un veredicto `unknown`
no midió nada. Dejar `0` mantiene viva la mitad del fallo original: un consumidor que
ordene el historial por `score`, pinte una barra de riesgo o evalúe `score < 25` vuelve
a leer "el más inocente" donde no hubo evaluación. `null` no tiene lugar en ese orden y
obliga a decidir qué hacer con él.

**Implicación para el contrato de la API** — es un cambio incompatible, y se asume:

| Campo | Antes | Ahora |
|---|---|---|
| `verdict.level` | 3 valores | 4 valores; `unknown` posible en cualquier endpoint de scan |
| `verdict.score` | `number` siempre | `number \| null`; `null` **si y sólo si** `level === "unknown"` |
| `sources[].level` | 3 valores | 4; `unknown` en los degradados |
| `sources[].score` | `number` siempre | `number \| null` en los degradados |

El código de estado HTTP **no** cambia: sigue siendo `200`. Un scan que no pudo evaluarse
es un resultado legítimo y completo del análisis, no un fallo del request; el cliente
tiene un cuerpo bien formado que renderizar (ADR 3). Lo que cambia es que ese cuerpo ya
no miente sobre lo que se sabe.

`confidence` sigue siendo `0` y no `null`: a diferencia del score, "cero respaldo" es una
afirmación exacta y ordenable — y es el mismo `0` que produce la fórmula de la regla 3
con cobertura nula. Un consumidor que ya filtraba por `confidence` sigue funcionando.

#### Caso límite: ningún Source aplicable para el tipo de IOC

Distinto de "todas degradadas", y se resuelve por el otro extremo: **`503` con código
`NO_SOURCE_AVAILABLE`**, sin Scan ni Verdict, y sin entrada en el historial.

Rationale: en el caso degradado se consultó y no se obtuvo respuesta — hay un hecho que
registrar. Aquí no se consultó nada porque el servidor está mal configurado; un `200` con
`unknown` diría "lo miramos y no sabemos" cuando la verdad es "no lo miramos", y
enterraría un fallo de despliegue en un resultado de aspecto normal. Un `503` es
accionable para el operador y no contamina el historial con scans vacíos.

Lo que ambos caminos comparten, que es lo que importa: **ninguno puede producir `clean`.**

### 2.5 Scan

Hecho histórico inmutable. Es lo que guarda el historial.

```
Scan = {
  id:        uuid,
  ioc:       IOC,
  verdict:   Verdict,
  sources:   SourceReport[],
  scannedAt: ISO-8601,
  mock:      boolean       // true si se resolvió con fuentes simuladas
}
```

`mock` está en la entidad a propósito: un Scan hecho en modo simulado **no es
intercambiable** con uno real, y el historial debe poder distinguirlos. Ocultarlo sería
mentirle al consumidor.

---

## 3. Capa de normalización — umbrales

El punto crítico del modelo: cada fuente habla un idioma distinto. Estas son las tablas de
traducción, y son la **única** definición autoritativa de los umbrales.

### 3.1 Bandas comunes (score agregado → level)

| Score | Level |
|---|---|
| 0 – 24 | `clean` |
| 25 – 74 | `suspicious` |
| 75 – 100 | `malicious` |

`unknown` **no aparece en esta tabla y no puede aparecer**: no hay score que lo produzca
ni banda que lo contenga (§2.4). Pedir la banda de `unknown` es un error de programación
y el modelo lanza en vez de devolver `[0, 24]`.

**Regla de coherencia `level` ↔ `score`.** Algunas fuentes deciden el nivel por
**conteo** y no por su score crudo (VirusTotal: ≥ 3 engines). Sin corrección, un
reporte podría decir `malicious` con score 34 — y la agregación, que deriva el nivel
del score, lo degradaría a `suspicious`. Por eso todo `SourceReport` pasa por un
ajuste que mueve el `score` al borde más cercano de la banda de su `level`
(34 + `malicious` → 75). Es la única forma de que `level` y `score` no puedan
contradecirse en ningún punto del sistema.

### 3.2 AbuseIPDB (`ip`)

Entrada: `abuseConfidenceScore` ∈ 0..100 — ya es una escala de confianza de abuso, así
que es un mapeo casi directo.

| `abuseConfidenceScore` | Level | `score` | `confidence` |
|---|---|---|---|
| 0 – 24 | `clean` | = score de entrada | `0.3` si `totalReports = 0`, si no `0.7` |
| 25 – 74 | `suspicious` | = score de entrada | `0.7` |
| ≥ 75 | `malicious` | = score de entrada | `0.9` |

*Umbral 25* es el que la propia AbuseIPDB usa como corte por defecto para "reportada".
*Umbral 75* es el corte a partir del cual los reportes son numerosos y consistentes.
Un score 0 con 0 reportes significa "nadie la ha reportado", que es débil → `confidence 0.3`.

### 3.3 VirusTotal (`hash`)

Entrada: **conteos por engine**, no un score. Hay que construir la escala.

Sea `m` = engines que marcan malicioso, `s` = sospechoso, `T` = total de engines que
respondieron (`malicious + suspicious + harmless + undetected`).

```
ratio = (m + 0.5 * s) / T
score = round(ratio * 100 * 8)   acotado a 100
```

El factor **8** es deliberado: en VirusTotal 3–5 detecciones sobre ~70 engines ya es una
señal fuerte de malware, pero el ratio crudo sería 0.05 (score 5) y caería en `clean`. La
escala se amplifica para que el corte por conteo y el corte por banda coincidan.

Las condiciones se evalúan **en este orden**; la primera que se cumple decide:

| # | Condición | Level | `confidence` |
|---|---|---|---|
| 1 | `m ≥ 3` | `malicious` | `0.9` |
| 2 | `m > 0` o `s > 0` | `suspicious` | `0.6` |
| 3 | resto (`m = 0` y `s = 0`) | `clean` | `0.6` (T ≥ 40) / `0.3` (T < 40) |

El conteo manda sobre el ratio en la decisión de `level`; el `score` numérico existe para
la agregación y para la UI, y se ajusta a la banda del nivel por la regla de coherencia
de §3.1. Rationale del corte en 3: 1–2 detecciones en VirusTotal son mayormente
heurísticas ruidosas y falsos positivos de engines menores; 3 o más independientes es el
umbral que usa la industria para tratar un hash como malicioso.

Un 404 de VirusTotal (**hash desconocido**) no es un fallo de la fuente: es información,
aunque débil. Se traduce a `clean` con `confidence: 0.2`, no a un reporte degradado —
y **tampoco a `unknown`**. La frontera es la del §1: VirusTotal contestó, y lo que
contestó ("no tengo registro de este archivo") es una observación real sobre el IOC.
`unknown` se reserva para cuando no hay ninguna observación. Mover este caso a `unknown`
convertiría en no concluyente cualquier fichero nunca visto, que es la mayoría, y
vaciaría de utilidad tanto al nivel `clean` como al propio `unknown`.

### 3.4 URLhaus (`domain`)

Entrada: estado de listado, no numérico. Se traduce por estado.

| Condición | Level | `score` | `confidence` |
|---|---|---|---|
| `query_status = "no_results"` | `clean` | `0` | `0.5` (ausencia de listado es señal débil) |
| Listado, todas las URLs `offline` | `suspicious` | `55` | `0.7` |
| Listado, alguna URL `online` | `malicious` | `90` | `0.95` |
| Listado y además en `blacklists` (spamhaus/surbl) | `malicious` | `100` | `0.95` |

Rationale: un dominio que **estuvo** distribuyendo malware pero cuyas URLs están caídas
sigue siendo sospechoso (infraestructura comprometida, suele reactivarse), pero no es
una amenaza activa → `suspicious`, no `malicious`.

---

## 4. Errores del dominio

| Error | Cuándo | Respuesta al cliente |
|---|---|---|
| `ValidationError` | El valor no satisface las invariantes del IOC | `400` + qué regla falló, sin eco del payload crudo |
| `SourceTimeoutError` | La fuente no respondió dentro del presupuesto | reporte `degraded`; nunca cuelga el request |
| `SourceRateLimitError` | La fuente devolvió 429 | reporte `degraded` |
| `SourceUnavailableError` | 5xx / red / respuesta con forma inesperada | reporte `degraded` |
| `ConfigurationError` | Modo real sin API key | **falla al arrancar**, no a mitad de un request |
| `NO_SOURCE_AVAILABLE` | Ningún Source atiende ese tipo de IOC | `503`, sin Scan ni entrada de historial (§2.4) |

Los tres errores de fuente terminan en un reporte `degraded`, y si **todos** los reportes
de un scan lo son, el Verdict resultante es `unknown` — nunca `clean` (§2.4, ADR 3).

Regla: los detalles internos de una fuente (URL, cuerpo del error, API key) **nunca**
cruzan hacia la respuesta HTTP. El cliente ve un mensaje estable del dominio.

---

## 5. Decisiones (ADR resumidas)

Solo se registran las tres que son difíciles de revertir, sorprendentes sin contexto, y
producto de una alternativa real descartada.

### ADR 1 — Validación por parsing, no por regex

**Contexto.** Hay que validar IP, hash y dominio. Lo obvio es una regex por tipo.
**Alternativas.** (a) Regex propias — las de IPv6/dominio que circulan tienen
cuantificadores anidados y son vector de ReDoS sobre input **controlado por el
atacante**, que es exactamente el caso aquí. (b) Una librería de validación.
(c) Parsing por partes + primitivas nativas.
**Decisión.** (c): `net.isIP` para IPs, `split(".")` + comprobación lineal para dominios,
longitud + clase de caracteres plana para hashes.
**Consecuencia.** Cero dependencias nuevas, complejidad lineal garantizada y superficie
de CVE de terceros nula en el camino caliente. A cambio, el código de validación es más
verboso que una regex.

### ADR 2 — El score agregado es el máximo, no el promedio

**Contexto.** Con varias fuentes hay que combinar sus scores.
**Alternativas.** Promedio (diluye), voto por mayoría (empata con 2 fuentes), máximo.
**Decisión.** Máximo sobre fuentes no degradadas; la incertidumbre se expresa en
`confidence`, no bajando el `score`.
**Consecuencia.** Sesgo hacia el falso positivo antes que hacia el falso negativo —
correcto para una herramienta de seguridad. Revertirlo cambiaría el veredicto de scans
ya guardados en el historial, por eso queda registrado.

### ADR 3 — Fallo de fuente ⇒ reporte degradado, no error del request

> **Estado: REVISADO.** Versión 1 aceptada en el diseño inicial; revisada tras la
> auditoría de `appsec-reviewer` (observación **OBS-2**, CWE-636 *Not Failing Securely*).
> La parte estructural de la v1 sigue vigente; lo que cambió es qué veredicto se emite
> cuando no queda ninguna fuente en pie. El texto de la v1 se conserva abajo a propósito:
> el error que contenía es más instructivo que su corrección.

**Contexto.** ¿Qué devuelve `POST /api/scan/ip` si AbuseIPDB da timeout?

**Alternativas.** (a) 502 al cliente. (b) Reporte degradado y veredicto de baja confianza.

**Decisión (v1, vigente en su parte estructural).** (b), con `degraded: true` visible en
la respuesta: el endpoint mantiene su contrato bajo fallo parcial, responde `200` y el
frontend siempre tiene algo que renderizar.

**Decisión (v2, esta revisión).** Con todas las fuentes degradadas el Verdict es
`level: "unknown"`, `score: null`, `confidence: 0`. Se añade `unknown` como cuarto nivel,
fuera de la escala numérica (§2.4).

**Qué decía la v1 y por qué estaba mal.** La v1 cerraba con esta consecuencia:

> *"a cambio el cliente debe mirar `confidence` y `degraded` para no leer un `clean`
> degradado como una garantía."*

Esa frase **era el fallo**, no una consecuencia aceptable de él. Delegaba la seguridad
del resultado en que un consumidor futuro — otro equipo, otro agente, un `curl` en una
terminal, una integración escrita con prisa — recordara mirar un campo secundario. El
campo que todo el mundo lee primero, `verdict.level`, decía `clean` sobre un IOC que
nadie llegó a evaluar. Un default que sólo es seguro si el consumidor hace algo extra
no es un default seguro: es una trampa con instrucciones de uso.

Tres razones concretas por las que no bastaba:

1. **El default fallaba abierto.** `clean` es exactamente el veredicto que un atacante
   querría inducir, y era el que se obtenía tirando la fuente.
2. **Era alcanzable sin privilegios.** El tier gratuito de AbuseIPDB da 1.000 checks/día
   con un límite de 60/min por IP: una sola IP agota la cuota diaria en ~17 minutos, y
   desde ahí todas las consultas del día — incluidas las de IPs maliciosas conocidas —
   devolvían `clean`. No hace falta comprometer nada: basta con gastar la cuota.
3. **El daño era silencioso.** Un `502` se ve; un `clean` falso no. El modo de fallo
   ruidoso era el seguro y lo habíamos descartado por el cómodo.

La corrección no es pedirle más al cliente, sino que el tipo de dato haga imposible la
lectura errónea: `unknown` no es un subtipo de `clean`, y `score: null` no se ordena
como un 0.

**Consecuencias.**

- Cambio incompatible en el contrato: cuatro valores de `level` y `score` anulable
  (tabla en §2.4). Se asume por preferible a un falso negativo silencioso.
- El consumidor **ya no necesita** mirar `confidence` ni `degraded` para no ser engañado.
  Siguen ahí y siguen siendo útiles — matizan un veredicto parcial, en el que unas
  fuentes respondieron y otras no — pero leer sólo `level` ya no puede producir una
  conclusión falsamente tranquilizadora. Ese es el punto entero de la revisión.
- El frontend gana un cuarto estado obligatorio. `unknown` **no se pinta en verde**:
  verde es "evaluado y limpio", y esto es lo contrario de evaluado.
- `unknown` no se propaga a los `SourceReport` de fuentes que sí respondieron: un hash
  desconocido para VirusTotal sigue siendo `clean` con confianza baja (§3.3). La
  distinción es "no hay observación" vs "la observación es débil".
- Los Scans ya guardados en el historial en memoria no se migran: el historial se vacía
  en cada arranque, así que no existe el problema de compatibilidad hacia atrás que sí
  tendría el ADR 2.
