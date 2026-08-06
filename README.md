# 🕷️ IOC Scanner — `devsecops-web-pipeline`

Aplicación web (backend + frontend) que escanea **IOCs** (Indicators of Compromise) —
IPs, hashes de archivo y dominios — contra fuentes públicas de threat intelligence, con
una identidad visual pixel art / retro.

Su propósito real es servir como **superficie de código para un pipeline de AppSec**:
código JavaScript/TypeScript con vulnerabilidades intencionales y documentadas, sobre el
que se validan escáneres **SAST** (CodeQL, Semgrep) y **SCA** (Dependabot, npm audit) en
GitHub Actions.

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

| Herramienta | Tipo | Cubre | Costo |
|---|---|---|---|
| CodeQL | SAST | Backend + frontend (JS/TS) | Gratis en repos públicos |
| Semgrep | SAST | Reglas community Node/Express y React | Gratis |
| Dependabot | SCA | Dependencias con CVEs conocidos | Gratis |
| npm audit | SCA | Complementario, corre en el pipeline | Gratis |

Los hallazgos se suben como SARIF a **Code Scanning** (anotación línea por línea en el PR),
bloquean el merge, y notifican al canal `#appsec-alerts` de Discord vía el secret
`DISCORD_WEBHOOK_URL_APPSEC`.

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/scan/ip` | Reputación de una IP (AbuseIPDB) |
| `POST` | `/api/scan/hash` | Hash MD5/SHA256 contra bases de IOCs (VirusTotal) |
| `POST` | `/api/scan/domain` | Dominio contra listas de bloqueo (URLhaus) |
| `GET` | `/api/history` | Historial de consultas |
| `GET` | `/api/health` | Health check |

Las fuentes externas corren en **modo mock por defecto** (`USE_MOCK_SOURCES=true`): el
trabajo de SAST es estático y no debe depender de rate limits de APIs de terceros.

## Construido con agentes

El proyecto se construye con **Claude Code** usando cuatro sub-agentes especializados
(`backend-builder`, `frontend-builder`, `pipeline-engineer`, `appsec-reviewer`) definidos
en [`.claude/agents/`](.claude/agents/). La guía de orquestación está en
[`docs/agents/orquestacion.md`](docs/agents/orquestacion.md).

## Plan completo

[`plan-app-ioc-scanner.md`](plan-app-ioc-scanner.md)
