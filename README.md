# 🕷️ IOC Scanner — `devsecops-web-pipeline`

Aplicación web (backend + frontend) que escanea **IOCs** (Indicators of Compromise) —
IPs, hashes de archivo y dominios — contra fuentes públicas de threat intelligence, con
una identidad visual pixel art / retro.

Su propósito real es servir como **superficie de código para un pipeline de AppSec**:
código JavaScript/TypeScript con vulnerabilidades intencionales y documentadas, sobre el
que se validan escáneres **SAST** (CodeQL, Semgrep) y **SCA** (npm audit) en GitHub Actions.

> **Proyecto relacionado:** este repo es la contraparte de **aplicación** de una iniciativa
> DevSecOps de dos frentes. La contraparte de **infraestructura (IaC)** vive en
> [`devsecops-terraform-pipeline`](https://github.com/Pqnxmiguel/devsecops-terraform-pipeline),
> donde el mismo patrón de pipeline se aplica a código Terraform con Checkov, tfsec y Trivy.

---

## ⚠️ Este repositorio contiene vulnerabilidades a propósito

No uses este código en producción. Contiene **8 vulnerabilidades intencionales**
(`VULN-01` … `VULN-08`), cada una marcada en el código y documentada en
[`docs/vulnerabilities/`](docs/vulnerabilities/), cuyo único fin es comprobar qué detecta
—y qué no— cada escáner.

Cualquier vulnerabilidad fuera de ese inventario es un bug real.

**Estado actual:** ninguna `VULN-NN` está introducida todavía. `main` es hoy la línea base
limpia (backend + frontend completos, sin vulnerabilidades) **con el pipeline ya operativo y
en verde** — el requisito para que cada vulnerabilidad que se introduzca después sea
distinguible del ruido. Se abrirán una por una, en ramas dedicadas. Ver
[`handoff.md`](handoff.md) para qué falta y en qué orden.

---

## Arquitectura

```
devsecops-web-pipeline/
├── backend/               API REST en Node.js + Express
├── frontend/              React + Tailwind (pixel art + mascota animada)
├── .github/workflows/     app-ci.yml — SAST + SCA + notificación a Discord
├── .claude/               agentes y skills usados para construir el proyecto
└── docs/                  vulnerabilidades, arquitectura, orquestación de agentes
```

## Escáneres

El pipeline [`app-ci.yml`](.github/workflows/app-ci.yml) está **operativo y validado contra
la línea base limpia**:

| Herramienta | Tipo | Cubre | Bloquea con | Línea base |
|---|---|---|---|---|
| CodeQL | SAST | Backend + frontend (JS/TS), `security-extended` | ≥1 hallazgo | ✅ 0 hallazgos |
| Semgrep | SAST | 6 packs community (222 reglas) | ≥1 `error`/`warning` | ✅ 0 bloqueantes |
| npm audit | SCA | `backend/` y `frontend/` | ≥1 `high`/`critical` | ✅ 0 / 0 |

Todo corre en el tier gratuito de repos públicos (**costo $0**). Los hallazgos se suben como
SARIF a **Code Scanning** —anotación línea por línea sobre el diff del PR— y se notifican a
Discord vía el secret `BOTDEVSECWEB`.

El workflow dispara en **cualquier rama**, no solo en PRs: una rama con una vulnerabilidad
produce escaneo y reporte a Discord sin necesidad de abrir el PR.

**Sobre Dependabot:** no hay `dependabot.yml` a propósito. Ese archivo configura *version
updates* (PRs semanales que suben dependencias) y pelearía contra `VULN-06`, que existe
justamente para sostener una dependencia vulnerable. La detección de dependencias con CVE
la cubre `npm audit` dentro del pipeline, que además bloquea.

El mapa de qué escáner detecta cada vulnerabilidad —y cuáles **no detecta nadie**— está en
[`docs/vulnerabilities/README.md`](docs/vulnerabilities/README.md).

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/scan/ip` | Reputación de una IP (AbuseIPDB) |
| `POST` | `/api/scan/hash` | Hash MD5/SHA1/SHA256 contra bases de IOCs (VirusTotal) |
| `POST` | `/api/scan/domain` | Dominio contra listas de bloqueo (URLhaus) |
| `GET` | `/api/history` | Historial de consultas (en memoria) |
| `GET` | `/api/quota` | Cuota diaria restante por fuente (ver abajo) |
| `GET` | `/api/health` | Health check |

Las fuentes externas corren en **modo mock por defecto** (`USE_MOCK_SOURCES=true`): el
trabajo de SAST es estático y no debe depender de rate limits de APIs de terceros. En modo
real (`USE_MOCK_SOURCES=false`, con API keys propias en `backend/.env`), un tracker de
cuota diaria por fuente evita superar el límite gratuito de cada proveedor —
AbuseIPDB (1000/día, reconciliado con sus headers reales), VirusTotal (500/día, contador
propio) y URLhaus (sin límite, requiere `URLHAUS_AUTH_KEY` desde la política "Community
First" de abuse.ch). El estado se puede consultar en `GET /api/quota` o preguntándole al
personaje directo en el chat ("cuántas consultas me quedan").

## Construido con agentes

El proyecto se construye con **Claude Code** usando cuatro sub-agentes especializados
(`backend-builder`, `frontend-builder`, `pipeline-engineer`, `appsec-reviewer`) definidos
en [`.claude/agents/`](.claude/agents/). La guía de orquestación está en
[`docs/agents/orquestacion.md`](docs/agents/orquestacion.md).

## Plan completo

[`plan-app-ioc-scanner.md`](plan-app-ioc-scanner.md)
