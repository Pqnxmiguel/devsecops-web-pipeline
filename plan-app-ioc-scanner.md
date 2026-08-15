# Plan de Desarrollo: IOC Scanner (App de Ciberseguridad)

> **Estado (actualizado):** este documento es el plan ORIGINAL, tal como se escribió antes
> de empezar a construir — se conserva así, sin reescribir el razonamiento, porque documenta
> el porqué de las decisiones. Para el estado real y actualizado del proyecto (qué está
> hecho, qué falta, qué esperar) ver **[`handoff.md`](handoff.md)**. Resumen rápido:
> backend + frontend completos y fusionados a `main` (línea base limpia, sin
> vulnerabilidades), modo real con AbuseIPDB/VirusTotal/URLhaus funcionando con tracker de
> cuota diaria (fuera del alcance original de este plan, agregado a pedido durante la
> construcción), y **`app-ci.yml` operativo con su línea base validada en verde**, incluida
> la notificación a Discord (secret `BOTDEVSECWEB`, no el nombre que aparece más abajo en
> este documento). **En curso: las `VULN-NN`, una por rama. VULN-01 (CWE-78, inyección de
> comandos) ya está introducida** —documentada en
> [`docs/vulnerabilities/VULN-01.md`](docs/vulnerabilities/VULN-01.md)—; faltan VULN-02…08.
> (El runbook de explotación paso a paso se mantiene local y sin versionar: contiene rutas de
> la máquina del operador.) Auditando VULN-01
> se descubrió que ningún pack de Semgrep detecta inyección de comandos en ESM, y hubo que
> sumar una regla suelta al pipeline; las limitaciones de cada escáner quedaron en
> [`docs/escaneres-alcance-y-limites.md`](docs/escaneres-alcance-y-limites.md). El inventario
> válido y actualizado vive en
> [`.claude/agents/appsec-reviewer.md`](.claude/agents/appsec-reviewer.md), no en la
> sección 3.4/4.3 de abajo, que fue el borrador inicial; el mapa de qué escáner detecta
> cada una está en
> [`docs/vulnerabilities/README.md`](docs/vulnerabilities/README.md).
>
> Dos decisiones posteriores contradicen lo que dice este plan, y mandan ellas:
> **no se usa `dependabot.yml`** (configuraría PRs que suben dependencias y pelearían
> contra VULN-06), y el secret de Discord se llama **`BOTDEVSECWEB`**.

## 1. Objetivo

Construir una aplicación web sencilla — **backend + frontend** — en un **repositorio independiente y nuevo, `devsecops-web-pipeline`**, que sirva como superficie de código real para probar escáneres SAST de aplicaciones (Semgrep, CodeQL) y SCA (Dependabot).

Este repo es el **proyecto hermano** de `devsecops-terraform-pipeline` (el pipeline de IaC ya construido): juntos forman una iniciativa DevSecOps de dos frentes — infraestructura y aplicación — cada uno con su propio ciclo de vida, su propio pipeline y su propia pestaña de Security, tal como se separan en equipos reales de Platform/DevOps vs. Producto/AppSec.

La app es un **escaneador de IOCs (Indicators of Compromise)**: recibe una IP, un hash de archivo o un dominio, y consulta si está reportado como malicioso en fuentes de threat intelligence gratuitas. El frontend sigue una identidad visual **pixel art / retro**, con una **mascota animada** que acompaña al usuario durante el escaneo.

Todo el desarrollo y las pruebas de escaneo son **estáticas** (SAST) — no requieren desplegar nada. El despliegue a AWS es un paso opcional y posterior, separado de la validación de los escáneres.

### 1.1 Relación entre los dos repositorios

| | `devsecops-terraform-pipeline` | `devsecops-web-pipeline` |
|---|---|---|
| Dominio | Infraestructura (IaC) | Aplicación (backend + frontend) |
| Qué escanea | Archivos `.tf` | Código JS/TS (Node/Express, React) |
| Escáneres SAST | Checkov, tfsec, Trivy | CodeQL, Semgrep |
| Escáner SCA | — | npm audit (Dependabot quedó fuera, ver §5) |
| Backend remoto Terraform | S3 + DynamoDB (propio) | — (no aplica; sin IaC propio, salvo que más adelante se agregue Terraform para desplegar la app) |
| Webhook Discord | secret `BOTDEVSEC` | secret `BOTDEVSECWEB` |
| README | Referencia cruzada al repo de AppSec | Referencia cruzada al repo de IaC |

Ambos README deben incluir una sección corta tipo *"Proyecto relacionado: ver [nombre del otro repo] para la contraparte de IaC/AppSec de esta iniciativa DevSecOps"*, con el link correspondiente.

---

## 2. Arquitectura general

Estructura del **nuevo** repositorio `devsecops-web-pipeline` (independiente de `devsecops-terraform-pipeline`):

```
devsecops-web-pipeline/
├── backend/                 API REST en Node.js/Express
├── frontend/                 React + Tailwind (consume la API)
├── .github/workflows/
│   └── app-ci.yml           SAST (CodeQL, Semgrep) + SCA (Dependabot/npm audit)
├── .gitignore
└── README.md                 con referencia cruzada a devsecops-terraform-pipeline
```

---

## 3. Backend

### 3.1 Framework: **Node.js + Express**

**Por qué esta elección:**
- Mismo lenguaje (JavaScript/TypeScript) que el frontend en React → un solo ecosistema `npm`, más simple de mantener y de escanear con las mismas herramientas.
- Express es minimalista: fácil de leer, ideal para meter vulnerabilidades de código intencionales de forma clara y didáctica (a diferencia de un framework con demasiada "magia" que oculte el problema).
- Ecosistema `npm` con dependencias conocidas por tener CVEs históricos documentados — perfecto para que Dependabot/`npm audit` tengan algo real que reportar.
- GitHub Advanced Security (CodeQL) tiene soporte de primera clase para JavaScript/TypeScript y Node.

### 3.2 Endpoints propuestos

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/scan/ip` | Consulta si una IP está reportada como maliciosa |
| `POST` | `/api/scan/hash` | Consulta un hash de archivo (MD5/SHA256) contra bases de IOCs |
| `POST` | `/api/scan/domain` | Consulta si un dominio está en listas de bloqueo |
| `GET` | `/api/history` | Devuelve el historial de consultas (almacenado en memoria o SQLite) |
| `GET` | `/api/health` | Health check simple |

### 3.3 Fuentes de datos externas (gratis, sin costo)

- **AbuseIPDB** (API gratuita con límite diario) — reputación de IPs.
- **URLhaus** (abuse.ch, sin API key) — dominios/URLs maliciosas.
- **VirusTotal API pública** (límite gratuito) — hashes de archivos.

Estas integraciones son opcionales para el objetivo de SAST — incluso una versión que simule las respuestas (mock) sirve igual de bien para probar los escáneres, y evita depender de límites de rate de APIs externas durante las pruebas del pipeline.

### 3.4 Vulnerabilidades intencionales a introducir (para que SAST tenga qué detectar)

Siguiendo el mismo patrón que usamos con Terraform — vulnerabilidades reales y documentadas, nunca desplegadas/ejecutadas en producción:

1. **Inyección de comandos** vía `child_process.exec()` con input del usuario sin sanitizar (en un endpoint que "resuelve" un dominio, por ejemplo).
2. **Secreto hardcodeado**: API key de AbuseIPDB/VirusTotal escrita directo en el código en vez de variable de entorno.
3. **Uso inseguro de `eval()`** o `Function()` sobre datos de entrada.
4. **CORS mal configurado**: `Access-Control-Allow-Origin: *` sin restricción.
5. **Falta de rate limiting / validación de input** (permite abuso del endpoint).
6. **Dependencia desactualizada con CVE conocido** (ej. una versión vieja de `lodash`, `express`, o `axios` con vulnerabilidad pública) — esto lo detecta Dependabot/`npm audit`, no Semgrep/CodeQL.

---

## 4. Frontend

### 4.1 Stack: **React + Tailwind CSS** (ya definido por ti)

- Formulario simple para ingresar IP / hash / dominio.
- Resultado visual tipo "veredicto": limpio / sospechoso / malicioso, con detalles de la fuente.
- Historial de consultas recientes.
- Sin backend propio de autenticación — consume directo la API de `app/backend`.

### 4.2 Identidad visual: estilo pixel art + mascota animada

La app completa sigue una dirección visual **pixel art / retro** (paleta limitada, bordes duros sin antialiasing, tipografía monoespaciada tipo 8-bit). El elemento central de esta identidad es una **mascota animada** — un personaje que acompaña al usuario durante el escaneo (ej. reacciona distinto según el veredicto: tranquilo si el IOC está limpio, alerta si es sospechoso/malicioso).

![Mascota del proyecto](imagen/spider.png)

*(Imagen de referencia real de la mascota. El sprite sheet animado que consume el frontend
se genera algorítmicamente a partir de esta foto — ver
`frontend/scripts/generate-mascot-sprite.mjs`. La imagen original `personajeSpider.jpg` fue
reemplazada por esta durante el rediseño a interfaz de chat/CCTV.)*

**Requisitos técnicos de esta identidad:**
- Sprites en formato *sprite sheet* (una sola imagen con varios frames) para las animaciones de la mascota (idle, alerta, éxito).
- `image-rendering: pixelated;` en CSS para que el navegador no suavice los sprites al escalarlos (crítico en pixel art — sin esto, Chrome/Firefox aplican antialiasing y se pierde el estilo).
- Tipografía pixel/retro (ej. "Press Start 2P" o "VT323" de Google Fonts) para toda la UI, no solo la mascota.
- Paleta de colores restringida y consistente (ideal: 8-16 colores) aplicada vía tokens de Tailwind, no colores sueltos por componente.

### 4.3 Vulnerabilidades intencionales en frontend (opcional, para XSS/DOM-based issues)

1. **XSS vía `dangerouslySetInnerHTML`** al renderizar el resultado de una consulta sin sanitizar.
2. **API key expuesta en el bundle del cliente** (si alguna consulta se hiciera directo desde el navegador en vez de pasar por el backend).

---

## 5. Escáneres a integrar en `app-ci.yml`

| Herramienta | Tipo | Qué cubre | Costo |
|---|---|---|---|
| **CodeQL** | SAST | Backend + frontend (JS/TS), nativo de GitHub, mismo sistema SARIF ya usado con Checkov/tfsec/Trivy | Gratis (repos públicos) |
| **Semgrep** | SAST | Reglas community para Node/Express y React (inyección, secrets, XSS) | Gratis (community rules) |
| **npm audit** | SCA | Dependencias de `package.json` con CVEs conocidos; corre y **bloquea** en el pipeline | Gratis |

> **Dependabot quedó fuera.** El plan original lo listaba, pero `dependabot.yml` configura
> *version updates*: PRs semanales que suben dependencias, incluida la que VULN-06 introduce
> a propósito. En un repo cuyo objetivo es *sostener* una dependencia vulnerable, eso pelea
> contra el inventario. La cobertura SCA la da `npm audit`. Lo que sí sirve, y es un
> interruptor de repo y no un archivo, son las Dependabot **alerts** (detección en la
> pestaña Security) — hoy apagadas.

---

## 6. Agentes y Skills recomendados (skills.sh)

Este proyecto se va a construir usando **Claude Code** con sub-agentes especializados por dominio (backend, frontend, seguridad), cada uno con las skills de skills.sh relevantes a su rol. Todas las skills listadas abajo son reales y verificadas en [skills.sh](https://www.skills.sh) al momento de escribir este plan.

### 6.1 Agente: `backend-builder`

**Rol:** construir y mantener la API en Express, incluyendo las vulnerabilidades intencionales documentadas.

**Skills recomendadas:**

| Skill | Fuente | Para qué sirve |
|---|---|---|
| `test-driven-development` | `obra/superpowers` | Loop TDD: test que falla → implementación mínima → verificación → refactor. Útil para los endpoints "limpios" del backend. |
| `domain-modeling` | `mattpocock/skills` | Modelar correctamente las entidades (IOC, consulta, resultado, fuente) antes de escribir el código. |
| `systematic-debugging` | `obra/superpowers` | Depuración metódica cuando algo falla en las integraciones con APIs externas. |
| `prisma-client-api` / `prisma-postgres-setup` | `prisma/skills` | Si se decide persistir el historial en una base real (Postgres) en vez de memoria/SQLite. |
| `verification-before-completion` | `obra/superpowers` | Fuerza una pasada de verificación antes de dar por completada cada tarea — clave para no dejar bugs silenciosos en un backend con vulnerabilidades intencionales mezcladas con código real. |

**Instalación (ejemplo):**
```bash
npx skills add obra/superpowers --skill test-driven-development
npx skills add obra/superpowers --skill systematic-debugging
npx skills add obra/superpowers --skill verification-before-completion
npx skills add mattpocock/skills --skill domain-modeling
```

### 6.2 Agente: `frontend-builder`

**Rol:** construir la interfaz en React + Tailwind, con identidad visual pixel art y la mascota animada, que consume la API del backend.

**Skills recomendadas (verificadas en skills.sh):**

| Skill | Fuente | Para qué sirve |
|---|---|---|
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | 69 reglas priorizadas de rendimiento en React: waterfalls de fetching, re-renders, bundle size. |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` | Componentes compuestos y patrones de contexto — útil para el formulario de consulta + panel de resultado + historial + mascota como componente independiente. |
| `shadcn` | `shadcn/ui` | Si se usan componentes shadcn/ui sobre Tailwind (acelera el armado de formularios y tarjetas de resultado, adaptándolos luego al estilo pixel art). |
| `tailwind-design-system` | `wshobson/agents` | Tokens de diseño y variantes consistentes en Tailwind — clave aquí para fijar la paleta restringida de 8-16 colores del estilo pixel art como tokens reutilizables, no valores sueltos. |
| `frontend-design` | `anthropics/skills` | Guía de dirección visual e intencionalidad de diseño — ya usada en este entorno de Claude. |
| `canvas-design` | `anthropics/skills` | Generación de artefactos visuales con una dirección estética definida — útil como referencia al fijar la identidad "pixel art / retro" del proyecto antes de construir componentes. |
| `webapp-testing` | `anthropics/skills` | Patrones de testing unit/integration/e2e para la app web completa. |

**Instalación (ejemplo):**
```bash
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices
npx skills add vercel-labs/agent-skills --skill vercel-composition-patterns
npx skills add shadcn/ui --skill shadcn
npx skills add wshobson/agents --skill tailwind-design-system
npx skills add anthropics/skills --skill canvas-design
npx skills add anthropics/skills --skill webapp-testing
```

### 6.2.1 Herramientas y librerías para la mascota animada (pixel art)

Estas son librerías/herramientas de desarrollo estándar (npm o de escritorio), **no skills de skills.sh** — se instalan directo en el proyecto o se usan como app externa para crear los sprites. Se listan aparte para no mezclarlas con las skills verificadas arriba.

| Herramienta | Tipo | Para qué sirve |
|---|---|---|
| **Aseprite** | App de escritorio (de pago, ~$20 una sola vez, no recurrente) | Editor estándar de la industria para crear y animar sprites pixel art frame por frame. Alternativa 100% gratis: **Piskel** (piskelapp.com, funciona en navegador). |
| **Framer Motion** (`framer-motion`) | Librería npm | Animaciones declarativas en React — útil para transiciones de la mascota entre estados (idle/alerta/éxito) más allá del sprite en sí (ej. rebote, escala). |
| **react-spring** (`@react-spring/web`) | Librería npm | Alternativa a Framer Motion basada en física de resortes — anima bien movimientos tipo "salto" de un personaje pixel art. |
| **CSS Sprite Sheets + `steps()`** | Técnica nativa (sin dependencia) | Animación de sprite sheet pura en CSS (`@keyframes` con `steps()` y `background-position`) — la forma más ligera y "correcta" de animar pixel art, sin librería adicional. |
| `image-rendering: pixelated` | Propiedad CSS nativa | Evita que el navegador suavice (antialiase) los sprites al escalarlos — imprescindible para que el pixel art se vea nítido. |

**Recomendación de implementación:** usar CSS puro con sprite sheet + `steps()` para el ciclo de animación de la mascota (más simple, cero dependencias, encaja perfecto con el estilo pixel art), y reservar Framer Motion solo para transiciones de UI que no sean parte del sprite (ej. aparición/desaparición de tarjetas de resultado).

> **Nota sobre skills de pixel art:** existen skills específicas para generación de sprites pixel art (ej. "Pixel Art Creator", "Pixel Art Professional") en otros directorios de skills como `claudemarketplaces.com` y `mcpmarket.com`, pero no se confirmó su publicación en `skills.sh` al momento de escribir este plan — por eso no se listan junto a las verificadas arriba. Si se quiere generar los sprites con ayuda de un agente (en vez de Aseprite/Piskel manual), vale la pena explorarlas directamente en su fuente antes de instalar.

### 6.3 Agente: `appsec-reviewer`

**Rol:** revisar el código generado por los dos agentes anteriores para confirmar que las vulnerabilidades intencionales están bien aisladas, documentadas, y que no se filtran vulnerabilidades *no intencionales* por descuido.

**Skills recomendadas:**

| Skill | Fuente | Para qué sirve |
|---|---|---|
| `code-review` | `mattpocock/skills` | Revisión de código estructurada antes de abrir el PR. |
| `receiving-code-review` | `obra/superpowers` | Procesar feedback de revisión de forma sistemática con seguimiento de tareas. |
| `diagnosing-bugs` / `diagnose` | `mattpocock/skills` | Diagnóstico dirigido cuando un escáner reporta un hallazgo que no está claro si es intencional o real. |

**Instalación (ejemplo):**
```bash
npx skills add mattpocock/skills --skill code-review
npx skills add obra/superpowers --skill receiving-code-review
npx skills add mattpocock/skills --skill diagnose
```

### 6.4 Testing end-to-end (opcional, si se decide probar la app corriendo localmente)

| Skill | Fuente | Para qué sirve |
|---|---|---|
| `playwright-cli` | `microsoft/playwright-cli` | Controlar un navegador real para explorar la app y grabar interacciones. |
| `playwright-best-practices` | `currents-dev/playwright-best-practices-skill` | Selectores, fixtures, paralelismo y CI para pruebas E2E. |

Nota: esto es para pruebas funcionales locales, no reemplaza el DAST — no es parte del pipeline de CI por ahora.

---

## 7. Webhook de Discord para AppSec

Se crea un canal y webhook **separado** del usado para IaC, siguiendo el mismo patrón ya implementado. Como ahora son dos repositorios distintos, cada uno guarda su propio secret de forma independiente — no se comparten entre repos:

> **Ya implementado, con nombres distintos a los que proponía este borrador.** El secret de
> este repo es **`BOTDEVSECWEB`** y el del repo de IaC es **`BOTDEVSEC`**. La entrega está
> verificada (HTTP 204) y el job de notificación falla explícitamente si Discord rechaza el
> mensaje, para que el pipeline no quede mudo en silencio.

1. Canal propio en el servidor de Discord, separado del de IaC.
2. Webhook en ese canal (mismo proceso que en la Fase 0/6 de `devsecops-terraform-pipeline`).
3. En el repo **`devsecops-web-pipeline`** → Settings → Secrets → secret `BOTDEVSECWEB`.
4. Cada repo guarda su propio secret de forma independiente — no se comparten.

---

## 8. Estructura del pipeline `app-ci.yml` (resumen, se detalla al construirlo)

Al ser un repositorio independiente, el trigger no necesita filtrar por `paths` de un subdirectorio compartido — corre sobre todo el repo, ya que aquí solo vive código de aplicación:

Estructura final implementada (difiere del borrador: dispara en **cualquier** rama, para que
una VULN-NN reporte a Discord sin necesidad de abrir el PR):

```yaml
on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  build-test:      # matriz backend/frontend: npm ci, lint, tests, build
  sast-codeql:     # CodeQL JS/TS security-extended -> bloquea con >=1 hallazgo
  sast-semgrep:    # 6 packs community -> bloquea con >=1 error/warning
  sca-npm-audit:   # matriz backend/frontend -> bloquea con >=1 high/critical
  notify-discord:  # embed a secrets.BOTDEVSECWEB; se omite en pull_request
```

Mismo patrón que `terraform-ci.yml` (repo hermano): jobs independientes, cada uno con su propio bloqueo, SARIF subido a Code Scanning, y notificación a Discord — pero con su propio secret de webhook, distinto al de IaC.

---

## 9. Confirmación de costo $0

- Desarrollo local: gratis.
- CodeQL: gratis en repos públicos, sin límite.
- Semgrep (community rules) vía GitHub Actions: gratis.
- Dependabot: gratis, nativo de GitHub.
- APIs externas (AbuseIPDB, URLhaus, VirusTotal): tiers gratuitos, sin tarjeta de crédito requerida para el nivel básico.
- Despliegue (si se hace más adelante): Lambda + API Gateway + S3 estático, dentro de Free Tier real.

---

## 10. Próximos pasos

1. ✅ Crear el repositorio `devsecops-web-pipeline` en GitHub (público, para Code Scanning/Actions gratis) y clonarlo localmente — mismo proceso que la Fase 0 del repo de IaC.
2. ✅ Crear la estructura de carpetas `backend/` y `frontend/` dentro del nuevo repo.
3. ✅ Backend: `npm init`, Express, endpoints base. Vulnerabilidades intencionales: **todavía no introducidas** (ver punto 10).
4. ✅ Frontend: React + Tailwind, interfaz de chat/CCTV con la mascota (evolucionó del formulario+panel original del plan), paleta pixel art como tokens de Tailwind.
5. ✅ Sprite sheet de la mascota — generado algorítmicamente desde una foto real (`generate-mascot-sprite.mjs`) en vez de dibujado a mano en Piskel/Aseprite, y animado con CSS `steps()` como estaba previsto.
6. ⬜ Agregar en el README de ambos repos la referencia cruzada entre `devsecops-terraform-pipeline` y `devsecops-web-pipeline` (falta confirmar si ya existe del lado de `devsecops-terraform-pipeline`).
7. ✅ Validar qué detectan los escáneres antes de confiar en el pipeline — **no fue posible en local** (Docker no disponible y Semgrep no tiene binario para Windows). Se hizo por la vía equivalente: pushear el workflow a una rama de descarte y validar ahí, mergeando a `main` recién con la línea base en verde. Ese sigue siendo el procedimiento para cualquier cambio de pipeline.
8. ✅ Crear `app-ci.yml`. Operativo en `main`: CodeQL 0 hallazgos, Semgrep 0 bloqueantes (222 reglas / 93 archivos), npm audit 0 en ambos paquetes.
9. ✅ Webhook de Discord + secret **`BOTDEVSECWEB`**, entrega confirmada (HTTP 204). Sin `dependabot.yml`, a propósito.
10. ⬜ Introducir las 8 `VULN-NN` una por una, cada una en su propia rama/PR contra el pipeline ya funcionando, y confirmar detección + anotación línea por línea + bloqueo + notificación por cada una. **Leer antes [`docs/vulnerabilities/README.md`](docs/vulnerabilities/README.md):** varias tienen restricciones de implementación sin las cuales no llegan siquiera a escanearse.

Detalle completo del estado actual, decisiones no previstas en este plan (tracker de cuota
diaria, modo real con las 3 fuentes) y qué falta exactamente: **[`handoff.md`](handoff.md)**.
