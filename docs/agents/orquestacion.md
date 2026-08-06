# Cómo orquestar los agentes de este proyecto

Esta guía es para ti (el humano). Explica cuándo lanzar cada agente, cómo escribir la
instrucción, y en qué orden construir el proyecto.

---

## 1. Los cuatro agentes y por qué están separados

| Agente | Dueño de | Herramientas | Rol |
|---|---|---|---|
| `backend-builder` | `backend/` | lectura + **escritura** + bash | API Express + VULN-01…06 |
| `frontend-builder` | `frontend/` | lectura + **escritura** + bash | React/Tailwind + pixel art + VULN-07, 08 |
| `pipeline-engineer` | `.github/` | lectura + **escritura** + bash | CodeQL, Semgrep, npm audit, Discord |
| `appsec-reviewer` | todo | **solo lectura** | audita: ¿toda vuln es intencional? |

La separación no es decorativa. Hace tres cosas:

**Aísla el contexto.** Cada agente arranca con una ventana limpia y solo la parte del
proyecto que le toca. El de frontend no gasta contexto leyendo servicios de Express.

**Evita pisadas.** Los tres constructores escriben en directorios disjuntos, así que
pueden correr **en paralelo** sin conflictos de archivos.

**Crea un control real.** `appsec-reviewer` no tiene `Write` ni `Edit` a propósito. No
puede "arreglar" lo que audita, así que no puede autoengañarse: su única salida es un
informe que tú lees. En un repo con vulnerabilidades intencionales, ese control es el que
impide que una vulnerabilidad *real* se camufle entre las de mentira.

---

## 2. Cómo se invoca un agente

Tienes tres formas, de menos a más control:

### a) Por nombre, en lenguaje natural
```
Usa backend-builder para crear el endpoint /api/health con su test.
```
Yo lanzo el subagente con esa instrucción. Es lo normal para el 90% de los casos.

### b) Pidiendo explícitamente varios en paralelo
```
Lanza en paralelo: backend-builder para el scaffold de Express,
y frontend-builder para el scaffold de Vite + Tailwind.
```
Ambos arrancan a la vez. Solo hazlo cuando las tareas **no dependan** una de otra.

### c) Continuando un agente ya lanzado
```
Dile a backend-builder que además agregue rate limiting al endpoint de IP.
```
Retoma al mismo agente con su contexto intacto, en vez de arrancar uno frío.

> Los agentes corren en segundo plano por defecto. Te aviso cuando terminan. Puedes seguir
> conversando mientras trabajan.

---

## 3. Cómo escribir una buena instrucción

Un subagente arranca **sin** el historial de nuestra conversación. Solo recibe: su archivo
de definición, `CLAUDE.md`, y el texto que le pasas. Si tu instrucción es vaga, el agente
adivina — y adivina mal.

**Mala:**
```
Usa backend-builder para hacer el backend.
```

**Buena:**
```
Usa backend-builder para:
1. Inicializar backend/ con npm + Express + Vitest.
2. Implementar GET /api/health con TDD (test primero).
3. Implementar POST /api/scan/ip con modo mock (USE_MOCK_SOURCES=true),
   validando que la entrada sea una IPv4 válida.
No introduzcas todavía ninguna vulnerabilidad intencional — eso va en un paso aparte.
Verifica con `npm test` y muéstrame la salida real.
```

Tres cosas que toda instrucción debería llevar:

1. **Alcance cerrado** — qué sí y qué no. "No introduzcas vulnerabilidades todavía" evita
   que el agente se adelante.
2. **Criterio de terminado** — qué comando prueba que funciona.
3. **Qué reportar** — la salida real del comando, no un "debería funcionar".

---

## 4. Orden de construcción recomendado

Cada fase termina con una revisión. No acumules tres fases sin auditar.

### Fase 1 — Scaffolds (paralelo)
`backend-builder` + `frontend-builder` a la vez.
Backend: `npm init`, Express, Vitest, `/api/health`. Frontend: Vite + React + Tailwind,
paleta pixel art como tokens, fuente retro.
→ **Nada de vulnerabilidades todavía.** Primero un código limpio que funcione.

### Fase 2 — Núcleo funcional (paralelo)
Backend: los 5 endpoints con mocks + historial + tests.
Frontend: formulario, panel de veredicto, historial, y la mascota animada con sprite sheet.
→ Al terminar: `appsec-reviewer` audita. En esta fase **no debería encontrar nada** —
si encuentra algo, es una vulnerabilidad accidental y hay que corregirla ya.

### Fase 3 — Vulnerabilidades intencionales (paralelo)
Backend: VULN-01…06. Frontend: VULN-07, 08.
Cada una con su comentario `[VULN-INTENCIONAL]` y su `docs/vulnerabilities/VULN-NN.md`.
→ Al terminar: `appsec-reviewer` verifica cobertura, marcado, documentación y aislamiento.

### Fase 4 — Validación local de escáneres
`pipeline-engineer` corre Semgrep y CodeQL **en local** y produce el mapa de cobertura:
qué VULN-NN detecta cada escáner, y cuáles no detecta nadie.
→ Ese mapa es el resultado más valioso del proyecto. Un escáner que no detecta una
vulnerabilidad que sabes que está ahí te enseña más que uno que la detecta.

### Fase 5 — Pipeline
`pipeline-engineer` escribe `app-ci.yml` y `dependabot.yml` contra los hallazgos **reales**
de la fase 4, no contra hipótesis.

### Fase 6 — PR de prueba
Rama con una vulnerabilidad aislada → confirmar detección, anotación línea por línea,
bloqueo del PR, y notificación a Discord.

---

## 5. El ciclo construir → auditar → corregir

Así se ve en la práctica:

```
1. Tú:  "Usa backend-builder para <tarea>"
2. Agente construye, verifica, reporta.
3. Tú:  "Usa appsec-reviewer para auditar lo que acaba de hacer backend-builder"
4. Reviewer devuelve: APROBADO / CON OBSERVACIONES / BLOQUEADO
5. Si hay hallazgos:
   "Usa backend-builder para corregir los hallazgos 1 y 3 del informe" (pega el informe)
6. Vuelve al paso 3 hasta APROBADO.
```

El paso 5 tiene truco: **pega el informe en la instrucción**. El constructor no vio el
informe del reviewer — son sesiones distintas. Si no se lo pasas, no sabe qué corregir.

---

## 6. Errores comunes

| Error | Qué pasa | Qué hacer |
|---|---|---|
| Lanzar en paralelo tareas dependientes | El frontend consume una API que aún no existe | Secuencial cuando B necesita el output de A |
| Instrucción sin criterio de terminado | El agente dice "listo" sin verificar | Exige el comando y su salida real |
| No pasar el informe del reviewer al constructor | Corrige a ciegas o no corrige | Pega el informe completo |
| Acumular 3 fases sin auditar | Vulnerabilidad accidental enterrada bajo código nuevo | Auditar al cierre de cada fase |
| Pedirle al reviewer que arregle algo | No tiene permiso de escritura | Es intencional — pasa el fix al constructor |
| Dejar que un agente toque el directorio de otro | Conflictos y contexto contaminado | Recuérdale su alcance en la instrucción |

---

## 7. Skills instaladas

23 skills en `.claude/skills/`, repartidas por rol. Los agentes las invocan solos cuando
la tarea las dispara; también puedes forzarlas ("usa la skill `domain-modeling` primero").

**backend-builder:** `domain-modeling`, `test-driven-development`, `nodejs-backend-patterns`,
`javascript-testing-patterns`, `systematic-debugging`, `verification-before-completion`

**frontend-builder:** `frontend-design`, `canvas-design`, `tailwind-design-system`,
`vercel-composition-patterns`, `vercel-react-best-practices`, `shadcn`, `webapp-testing`

**appsec-reviewer:** `code-review`, `diagnosing-bugs`, `sast-configuration`,
`secrets-management`, `receiving-code-review`

**pipeline-engineer:** `github-actions-templates`, `sast-configuration`, `secrets-management`

**Orquestación (las uso yo, no los subagentes):** `writing-plans`,
`subagent-driven-development`, `dispatching-parallel-agents`, `requesting-code-review`

Para agregar una skill nueva:
```bash
npx skills add <owner>/<repo> -a claude-code -y -s <nombre-skill>
```
Ojo con dos detalles que no son obvios: el agente es `claude-code` (no `claude`), y para
varias skills se repite `-s` una vez por cada una — la lista separada por comas falla.
