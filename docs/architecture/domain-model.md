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
| **Verdict** | El juicio agregado de un Scan: `clean` / `suspicious` / `malicious` + una confianza. |
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
  fueron. Un IOC desconocido para todas las fuentes es `clean` con confidence **baja**;
  una IP con 98 de abuso es `malicious` con confidence **alta**.

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
  level:      "clean" | "suspicious" | "malicious",
  score:      0..100,        // cuán malicioso, escala común
  confidence: 0..1,          // cuánto respaldo tiene esta lectura
  details:    { ... },       // resumen legible, ya traducido (nunca el payload crudo)
  queriedAt:  ISO-8601,
  degraded:   boolean        // true si la fuente falló y esto es un reporte de relleno
}
```

`degraded: true` es la respuesta a: *"¿qué pasa si VirusTotal está caído?"*. No se rompe
el Scan ni se inventa un veredicto: se emite un reporte degradado (`level: "clean"`,
`score: 0`, `confidence: 0`) y el Scan resultante tiene confianza baja y lo declara.

### 2.4 Verdict

```
Verdict = {
  level:      "clean" | "suspicious" | "malicious",
  score:      0..100,
  confidence: 0..1,
  summary:    string   // una frase, apta para mostrar al usuario
}
```

**Agregación de N SourceReports a un Verdict:**

1. `score` del Verdict = **máximo** de los `score` de las fuentes no degradadas.
   Rationale: en threat intel una sola fuente que grita "malicioso" con evidencia pesa
   más que dos que dicen "no lo conozco". Promediar diluiría la señal — "no tengo datos"
   no es evidencia de inocencia.
2. `level` se deriva del `score` agregado con las bandas comunes (tabla §3).
3. `confidence` = media de las `confidence` de las fuentes **no** degradadas, por
   `(fuentes no degradadas / fuentes consultadas)`. Todas degradadas → `confidence: 0`.

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
aunque débil. Se traduce a `clean` con `confidence: 0.2`, no a un reporte degradado.

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

**Contexto.** ¿Qué devuelve `POST /api/scan/ip` si AbuseIPDB da timeout?
**Alternativas.** (a) 502 al cliente. (b) Reporte degradado y veredicto de baja confianza.
**Decisión.** (b), con `degraded: true` visible en la respuesta.
**Consecuencia.** El endpoint mantiene su contrato bajo fallo parcial y el frontend
siempre tiene algo que renderizar; a cambio el cliente debe mirar `confidence` y
`degraded` para no leer un `clean` degradado como una garantía.
