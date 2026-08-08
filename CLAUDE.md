# devsecops-web-pipeline — IOC Scanner

App web (backend + frontend) que sirve como **superficie de código real para probar
escáneres SAST (CodeQL, Semgrep) y SCA (Dependabot, npm audit)**. Repo hermano de
`devsecops-terraform-pipeline` (la contraparte de IaC).

La app escanea **IOCs** (Indicators of Compromise): recibe una IP, un hash o un dominio y
consulta si está reportado como malicioso. Identidad visual **pixel art / retro** con una
mascota animada (`imagen/personajeSpider.jpg`).

Plan completo: `plan-app-ioc-scanner.md`.

## Regla central de este repo

Este código **contiene vulnerabilidades a propósito**. Hay exactamente 8, listadas en
`.claude/agents/appsec-reviewer.md` como VULN-01 … VULN-08. Cada una:

- lleva un comentario `// [VULN-INTENCIONAL: CWE-NNN] … ver docs/vulnerabilities/VULN-NN.md`
- está documentada en `docs/vulnerabilities/VULN-NN.md`
- nunca se ejecuta contra un servicio real ni se despliega

**Cualquier vulnerabilidad fuera de esa lista es un bug real y debe corregirse.**
No agregues vulnerabilidades nuevas sin actualizar el inventario.

## Agentes

| Agente | Dueño de | Nunca toca |
|---|---|---|
| `backend-builder` | `backend/` | frontend, workflows |
| `frontend-builder` | `frontend/` | backend, workflows |
| `pipeline-engineer` | `.github/` | código de app |
| `appsec-reviewer` | audita todo (solo lectura) | no edita nada |

Guía de orquestación: `docs/agents/orquestacion.md`.

## Convenciones

- Backend: Node.js + Express, capas en `backend/src/{routes,controllers,services,middleware,models,utils,config}`.
- Frontend: React + Tailwind. Paleta de 8–16 colores **como tokens de Tailwind**, nunca
  colores sueltos. `image-rendering: pixelated` en todo sprite. Animación de la mascota con
  sprite sheet + CSS `steps()`, sin librería.
- Fuentes externas (AbuseIPDB, VirusTotal, URLhaus) tienen **modo mock por defecto**
  (`USE_MOCK_SOURCES=true`). El trabajo de SAST es estático — no dependas de rate limits.
- Pipeline: `.github/workflows/app-ci.yml` ya existe y su línea base está verde. Dispara en
  **cualquier rama**, así que una VULN-NN reporta a Discord sin abrir PR. Antes de tocarlo,
  leer las lecciones aprendidas en `.claude/agents/pipeline-engineer.md` — varias formas de
  dejarlo "verde mintiendo" ya se cometieron una vez. **No crear `dependabot.yml`**: pelearía
  contra VULN-06.
- Discord: secret **`BOTDEVSECWEB`** (ya creado en el repo). El repo hermano de IaC usa
  `BOTDEVSEC` — no confundirlos.
- Todo debe correr a **costo $0** (tier gratuito de GitHub en repo público).
