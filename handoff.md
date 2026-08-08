# Handoff — IOC Scanner (`devsecops-web-pipeline`)

Documento de contexto para retomar el proyecto sin tener que releer todo el historial de
conversación. Refleja el estado real al momento de escribirlo, no el plan original (ver
[`plan-app-ioc-scanner.md`](plan-app-ioc-scanner.md) para el porqué de las decisiones de
diseño, y [`docs/architecture/`](docs/architecture/) para el detalle técnico de cada una).

## 1. Qué es esto

App web (backend Node/Express + frontend React/Tailwind) que consulta si una IP, un hash de
archivo o un dominio está reportado como malicioso, contra AbuseIPDB, VirusTotal y URLhaus.
Su propósito real es ser **superficie de código para probar un pipeline de AppSec**
(CodeQL, Semgrep, npm audit) — contendrá 8 vulnerabilidades intencionales y documentadas,
introducidas una por una en ramas dedicadas.

Repo: https://github.com/Pqnxmiguel/devsecops-web-pipeline (público). Repo hermano de IaC:
`devsecops-terraform-pipeline`.

## 2. Estado de git — leer esto primero

- **`main` está publicado y al día con `origin/main`.** Contiene backend + frontend
  completos, modo real, tracker de cuota, y el pipeline `app-ci.yml`.
- Ramas en el remoto: `feat/frontend` y `chore/ci-pipeline`, ambas ya mergeadas a `main`
  con `--no-ff`. Se conservan (convención del repo: no se borran tras el merge).
- Línea base limpia y **verificada en CI**, no solo en local: ver §3.
- Tests: 318 backend + 45 frontend, lint y builds limpios.

## 3. Qué está construido y funcionando

### Backend (`backend/`)
- Endpoints: `POST /api/scan/{ip,hash,domain}`, `GET /api/history`, `GET /api/quota`,
  `GET /api/health`.
- Modelo de veredicto con 4 niveles (`clean`/`suspicious`/`malicious`/`unknown`) — `unknown`
  cuando ninguna fuente pudo responder (fix deliberado de un fail-open real, CWE-636, ver
  ADR 3 en `docs/architecture/domain-model.md`).
- Modo mock por defecto (`USE_MOCK_SOURCES=true`, cero red, valores deterministas
  documentados en `backend/.env.example`) y **modo real ya probado end-to-end** con las 3
  keys del usuario contra las APIs de verdad.
- **Tracker de cuota diaria** (`backend/src/services/quota/quotaTracker.js`), persistido en
  `backend/data/quota-state.json` (gitignorado) — no estaba en el plan original, se agregó
  a pedido para no superar los límites gratuitos:
  - AbuseIPDB: 1000/día, reconciliado con sus headers reales (`X-RateLimit-*`) en cada
    respuesta — esa es la fuente de verdad, no el contador propio.
  - VirusTotal: 500/día, contador propio (VT no expone remanente por header de forma
    confiable).
  - URLhaus: sin límite publicado, nunca bloquea, sólo cuenta para informar.
  - El gating corta ANTES de tocar la red si no queda margen — nunca se arriesga a superar
    el límite real de un proveedor.
- Vulnerabilidades intencionales: **ninguna implementada todavía** (confirmado por
  auditoría de `appsec-reviewer`, ver §6).

### Frontend (`frontend/`)
- Interfaz de **chat con la mascota** (no formulario+panel como decía el plan original): el
  personaje pregunta qué IOC consultar, responde con el veredicto enriquecido (categorías de
  AbuseIPDB, clasificación de amenaza de VirusTotal, tags de URLhaus).
- Identidad visual "cámara vieja de vigilancia" (CCTV): glitch/grano/scanlines continuos,
  no sólo en alertas — pedido explícito del usuario.
- Fondo ambiental: araña + telarañas en pixel-art, derivadas por downsampling algorítmico de
  una foto real (`imagen/araña.png`), con glitch de borde + parpadeo de píxeles teñido según
  el veredicto activo. Mismo mecanismo que el sprite de la mascota (`imagen/spider.png`).
- Sin historial visible (se sacó a pedido — "no tiene sentido si es un chat"). El endpoint
  `GET /api/history` del backend sigue vivo, simplemente no se consume desde el frontend.
- Cuota restante visible de dos formas: footer compacto en cada veredicto real, y
  preguntándole al personaje directo (frases como "cuántas consultas me quedan", "cuota",
  "límite diario", o literal `/quota` — allowlist fijo en `frontend/src/lib/quotaQuery.ts`,
  no NLP).
- Todos los efectos de glitch respetan WCAG 2.3.1 (fotosensibilidad) y se apagan con
  `prefers-reduced-motion: reduce`.

### Pipeline (`.github/workflows/app-ci.yml`)

Operativo en `main` y validado contra la línea base limpia. 5 jobs: `build-test` (matriz
backend/frontend), `sast-codeql`, `sast-semgrep`, `sca-npm-audit` (matriz), `notify-discord`.

| Escáner | Línea base | Bloquea con |
|---|---|---|
| CodeQL `security-extended` | 0 hallazgos | ≥1 hallazgo |
| Semgrep (6 packs, 222 reglas, 93 archivos) | 0 bloqueantes, 7 informativos | ≥1 `error`/`warning` |
| npm audit backend / frontend | 0 / 0 | ≥1 `high`/`critical` |
| Discord (`BOTDEVSECWEB`) | entregado, HTTP 204 | — |

Los 7 informativos son reglas `good_helmet_checks` de njsscan: confirman que Helmet **está**
bien configurado, no son vulnerabilidades.

Decisiones que no son obvias:

- **Dispara en cualquier rama** (`branches: ['**']`), no solo en PRs: una rama con una
  VULN-NN produce escaneo y alerta a Discord sin abrir PR. En `pull_request` los escáneres
  corren igual (para anotar el diff) pero Discord se omite, porque el push del mismo commit
  ya envió el mensaje.
- **Alcance acotado a `backend/` y `frontend/` como lista blanca.** Hay 247 archivos
  versionados bajo `.claude/` con cientos de credenciales de ejemplo en su documentación;
  sin acotar, `p/secrets` se enciende entero.
- **Sin `dependabot.yml`, a propósito** — configuraría PRs semanales que suben dependencias
  y pelearían contra VULN-06. Dependabot *alerts* (un interruptor del repo, no un archivo)
  está apagado; encenderlo sumaría detección en la pestaña Security.
- Una supresión justificada: `node_insecure_random_generator`, que marca los `Math.random()`
  del glitch visual CCTV. No hay uso criptográfico de aleatoriedad en la app.

**Dos bugs reales del pipeline, encontrados sólo al ejecutarlo**, ambos del tipo que lo deja
*verde mintiendo* (detalle completo en `.claude/agents/pipeline-engineer.md`):

1. `p/express` **no existe** (HTTP 404). Sus reglas ya venían en `p/javascript`. Lo detectó
   el guard de errores parciales; sin él, el job pasaba en verde escaneando 5 packs de 6.
2. **El gate de Semgrep no bloqueaba nada.** Semgrep no escribe `level` por resultado: lo
   declara por regla en `defaultConfiguration.level`. Leer `.level` del resultado daba
   `null` siempre, así que el conteo de bloqueantes era 0 aun con 129 reglas `error` y 87
   `warning` cargadas. Sin corregirlo, la primera VULN habría pasado en verde y el pipeline
   entero habría sido teatro.

**Procedimiento obligatorio para tocar el pipeline:** Semgrep y CodeQL no se pueden correr
en local en esta máquina (Docker no disponible, Semgrep sin binario para Windows). Se valida
pusheando a una rama de descarte y se mergea a `main` recién con la línea base en verde.
`actionlint` en local antes de pushear atrapa los errores de sintaxis y expresión.

### Seguridad verificada
- Auditoría completa de `appsec-reviewer` sobre fuga de las credenciales reales del usuario:
  **limpio** — escaneo por valor literal de las 3 keys sobre todo el working tree, el bundle
  del frontend, el estado de cuota persistido, y los 392 blobs de git (incluidos huérfanos y
  stash). `backend/.env` nunca se commiteó. CORS es whitelist explícita, sin comodín.
- Un hallazgo real (no intencional) encontrado y corregido en esa misma pasada: el backend
  escuchaba en `0.0.0.0` en vez de `127.0.0.1` — cualquiera en la misma red podía gastar la
  cuota real del operador. Fix: `HOST` en `config/index.js`, default `127.0.0.1`.
- Otro bug real encontrado y corregido: `npm run dev`/`start` nunca cargaban `backend/.env`
  (faltaba `--env-file-if-exists`), así que `USE_MOCK_SOURCES=false` en el archivo no tenía
  efecto hasta que se corrigió el script.
- Secret scanning + push protection ya están **activados** en la config de GitHub del repo
  (verificado con `gh api`, no hace falta tocarlo).

## 4. Cosas a tener en cuenta al retomar

- **URLhaus ahora exige `Auth-Key`.** abuse.ch cambió de política ("Community First",
  2024-2025) después de que se escribiera el código original — sin `URLHAUS_AUTH_KEY` en
  `.env`, esa fuente se degrada a `unavailable` en modo real. El usuario ya tiene su key
  configurada; si alguien clona el repo de cero, necesita sacar la suya gratis en
  https://auth.abuse.ch/.
- **`.env` no viaja con el repo** (gitignorado a propósito, nunca commiteado). Quien clone
  el repo arranca en modo mock automáticamente sin configurar nada (`USE_MOCK_SOURCES`
  default es `true`); sólo necesita `.env` propio si quiere modo real.
- **Deuda menor, no urgente:** `getHistory()`/`HistoryPage` en
  `frontend/src/lib/api.ts`/`types.ts` quedaron sin uso desde que se sacó el historial del
  UI. Se dejaron a propósito (decisión explícita de no tocar esos archivos en ese momento);
  se pueden limpiar cuando convenga.
- **No dejar servers de dev corriendo entre sesiones de tuneo de branches/merges.** Ya pasó
  una vez en esta sesión: Vite con `--watch` sigue vivo mientras el working tree cambia por
  debajo (checkout, merge), entra en pánico con HMR y parece "todo roto" sin que el código
  tenga nada malo. Si se va a cambiar de rama o mergear, matar los dev servers primero y
  levantarlos de nuevo después.

## 5. Ejemplos reales verificados para testear en modo real

(Los datos de amenazas cambian — si por reportes activos, algo de esto ya no da el mismo
veredicto, no es un bug.)

| IOC | Valor | Esperado |
|---|---|---|
| IP limpia | `8.8.8.8` | `clean` |
| Dominio limpio | `google.com` | `clean` |
| IP maliciosa | `45.148.10.152` | `malicious` (AbuseIPDB) |
| Dominio malicioso | `hindustanagency.com` | `malicious` (URLhaus, puede caducar) |
| Hash malicioso | `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` | `malicious` — EICAR, verificado 64/66 engines en VirusTotal |

## 6. Qué falta — en orden

1. **Introducir las 8 `VULN-NN`, una por una**, cada una en su propia rama contra el
   pipeline ya funcionando, para demostrar detección/anotación/bloqueo/notificación
   individualmente. Inventario canónico y único válido:
   [`.claude/agents/appsec-reviewer.md`](.claude/agents/appsec-reviewer.md) (VULN-01 CWE-78
   hasta VULN-08 CWE-200) — **no** la lista del borrador en
   `plan-app-ioc-scanner.md` §3.4/§4.3, que quedó desactualizada.

   **Leer antes [`docs/vulnerabilities/README.md`](docs/vulnerabilities/README.md).** Tiene
   el mapa de cobertura previsto y, sobre todo, las restricciones de implementación sin las
   cuales la vulnerabilidad no llega siquiera a escanearse. En resumen:
   - **VULN-02 / VULN-08:** literal inequívocamente falso. Push protection está activo; si
     se parece al token de un proveedor real, GitHub **bloquea el push de la rama** y el
     pipeline nunca corre. Nunca usar las credenciales reales del usuario (ver §3).
   - **VULN-04:** escribirla como `cors({ origin: '*', credentials: true })`, no con
     `res.setHeader` a mano, o la cobertura cae mucho.
   - **VULN-06:** advisory **high o critical** (el gate no bloquea con `moderate`) y
     **regenerar `package-lock.json`**, o `npm ci` falla antes del escaneo.
   - **VULN-05:** probablemente no la detecte nadie. Es un límite conceptual del SAST, no
     un fallo de configuración — y documentarlo así es más valioso que forzar la detección.
   - **VULN-04 y VULN-05 rompen tests existentes** de CORS y de rate limiting. Es esperado;
     ajustarlos en el mismo commit y decirlo en el mensaje, porque si no el embed de Discord
     dirá "se detectaron hallazgos" por una causa que no es de seguridad.
   - Nota: VULN-07 (XSS) y VULN-08 (key expuesta en el bundle) se implementaron una vez sin
     que se pidiera, durante el rediseño a chat/CCTV, y se revirtieron por completo antes de
     commitear nada — el código conceptual ya se pensó una vez, puede ser un punto de
     partida cuando llegue su turno, pero no existe en el repo hoy.
   - Al implementar VULN-01/02/03/08: hacerlo con `USE_MOCK_SOURCES=true`.
2. Crear `docs/vulnerabilities/VULN-01.md` … `VULN-08.md` a medida que cada una se
   introduce (CWE, ubicación, **qué escáner la detectó realmente** contrastado con la
   predicción, explotabilidad, fix correcto, link al run de CI).
3. Confirmar si `devsecops-terraform-pipeline` ya tiene la referencia cruzada al README de
   este repo (pendiente de verificar, no de crear).
4. Deuda menor del pipeline, no urgente: las actions van varias mayores atrás
   (`checkout` v4→v7, `setup-node` v4→v7, `upload-artifact` v4→v7, `download-artifact`
   v4→v8) y el runner avisa por deprecación de Node 20; `codeql-action` v3 se deprecia en
   diciembre de 2026.
5. Portar al repo hermano de IaC el bug de truncado que se corrigió aquí: `terraform-ci.yml`
   usa `cut -c1-1000`, que corta **por línea** y no el total, así que un reporte con muchos
   hallazgos supera los 1024 caracteres por campo, Discord devuelve 400 y se pierde el
   mensaje entero.

## 7. Qué esperar del usuario antes de avanzar

- El usuario probó manualmente el frontend completo (chat, glitch, fondo, cuota) en
  `localhost` y dio el visto bueno — no hace falta re-testear desde cero, pero cualquier
  cambio nuevo en frontend sigue el mismo patrón: build+test propios primero, luego
  levantar servers para que lo pruebe en el navegador.
- El usuario ya confirmó el plan de "una vulnerabilidad por rama" — no hace falta
  re-preguntar esa parte, sólo ejecutar. Sí confirma **cuál** vulnerabilidad va primero.
- Trabaja en español; los documentos del repo están en español y conviene mantenerlo.
