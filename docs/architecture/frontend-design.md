# Dirección visual — IOC Scanner (frontend)

> Fijada antes de escribir componentes, como exige `.claude/agents/frontend-builder.md`.
> Referencia: `imagen/personajeSpider.jpg` — silueta pixel art de paleta muy oscura
> (negros, grises azulados), sombrero, gafas blancas brillantes, objeto claro en la mano.

## 1. Paleta — 13 tokens, todos en `tailwind.config.js` bajo `colors.pixel`

Ningún componente usa un color suelto (`bg-[#...]`). Todo pasa por un token.

| Token | Hex | Uso |
|---|---|---|
| `pixel-bg` | `#0a0a0f` | Fondo de página. Negro casi puro, como el sombrero de la mascota. |
| `pixel-bg2` | `#12121a` | Fondo de tarjetas/paneles — un escalón más claro que la página. |
| `pixel-ink` | `#1c1f2b` | Superficie de componentes (inputs, filas de historial). |
| `pixel-ink2` | `#2a2e3f` | Bordes duros de componentes, divisores. |
| `pixel-slate` | `#3d4256` | Bordes activos/hover, estructura secundaria. |
| `pixel-fog` | `#6b7280` | Texto secundario, placeholders, metadatos (timestamps). |
| `pixel-mist` | `#a8b0c3` | Texto de cuerpo por defecto — gris azulado, nunca blanco puro. |
| `pixel-glass` | `#f4f6fb` | Texto de énfasis, títulos, y el color de las gafas de la mascota. Es el único casi-blanco de la paleta — reservado para lo que debe "brillar", igual que en la referencia. |
| `pixel-glow` | `#dce8ff` | Halo/glow sutil alrededor de la mascota y focus rings. |
| `pixel-clean` | `#3ddc84` | Verdict `clean`. Verde — el único nivel que se pinta en verde. |
| `pixel-suspicious` | `#f5c542` | Verdict `suspicious`. Ámbar. |
| `pixel-malicious` | `#e5484d` | Verdict `malicious`. Rojo. |
| `pixel-unknown` | `#9b8cff` | Verdict `unknown`. Violeta — deliberadamente fuera de la familia
semáforo verde/ámbar/rojo, para que sea imposible confundirlo con "limpio" de un
vistazo. Es también el color del estado `confused` de la mascota. |

**Regla de la trampa (`unknown`):** `pixel-unknown` no es un tono de `pixel-clean` ni
aparece nunca en un `else` que agrupe "todo lo que no es rojo/ámbar". Tiene su propia
rama explícita en cada componente que pinta por nivel (badge de veredicto, barra de
riesgo, mascota, fila de historial).

## 2. Tipografía

Ambas de Google Fonts, cargadas globalmente vía `@fontsource` (self-hosted en el bundle,
no un `<link>` a Google Fonts en runtime — evita una dependencia de red externa y una
fuga de IP del visitante a un tercero):

- **`Press Start 2P`** (`font-pixel`) — headers, botones, badges, etiquetas cortas.
  Es la fuente "logo" del proyecto: cada glifo es literalmente un sprite de 8×8, encaja
  con la estética de la mascota. Ilegible en párrafos largos, así que se restringe a
  texto corto (≤ ~40 caracteres).
- **`VT323`** (`font-mono-pixel`) — cuerpo de texto, `summary` del veredicto, detalles
  por fuente, historial. Sigue siendo una fuente pixel/terminal retro, pero legible en
  frases largas. Es la que sostiene "toda la UI usa tipografía pixel", no sólo la mascota.

Ambas se declaran en `tailwind.config.js` como `fontFamily.pixel` / `fontFamily.mono-pixel`
y se aplican vía `@layer base` en `index.css`, así ningún componente decide su propia
fuente.

## 3. Bordes, sombras, esquinas

- `border-radius: 0` en todo — sin excepciones. Un pixel art con esquinas redondeadas
  se ve roto.
- Bordes duros de 2–4px (`border-2`/`border-4`), nunca `box-shadow` difuminado. Donde se
  necesita profundidad se usa un "pixel shadow" — un segundo bloque sólido desplazado
  (`box-shadow: 4px 4px 0 0 var(--pixel-ink2)`), no un blur.
- Focus ring visible y anguloso: `outline: 2px solid pixel-glow`, `outline-offset: 2px`
  — accesibilidad primero, sin sacrificar el estilo (ver §6).

## 4. La mascota — 4 estados, no 3

El ADR 3 (revisado) de `docs/architecture/domain-model.md` añadió `unknown` como cuarto
nivel de veredicto, fuera de la escala semáforo. La mascota tiene que reflejar eso con un
cuarto estado propio, no reutilizar ninguno de los otros tres:

| Estado mascota | Verdict | Color dominante | Idea visual |
|---|---|---|---|
| `idle` | — (sin consulta aún) | `pixel-mist` | Postura neutra, ligera respiración (loop de 2 frames). |
| `scanning` | consulta en vuelo | `pixel-glow` | Gafas parpadean rápido, postura inclinada hacia adelante. |
| `calm` | `clean` | `pixel-clean` | Postura relajada, brazo bajo. |
| `alert` | `suspicious` \| `malicious` | `pixel-suspicious` / `pixel-malicious` | Postura tensa, objeto en alto. La intensidad (ámbar vs rojo) distingue sospechoso de malicioso, pero la pose es la misma "alerta". |
| `confused` | `unknown` | `pixel-unknown` | Gafas con un signo de interrogación/parpadeo irregular, postura encogida de hombros — visualmente **la más distinta** de las cuatro, para que no se pueda confundir con `calm` de un vistazo rápido. |

Sprite sheet real (dibujado a mano, pixel a pixel, en la paleta de arriba — ver §5) en
`public/sprites/mascot.png`, 5 frames por fila × 2 frames de animación por estado
(10 frames, grid 5×2 de 32×32px cada uno). Animado con `@keyframes` + `steps()` sobre
`background-position`, cero dependencias. `image-rendering: pixelated` en el elemento
que lo pinta.

## 5. Sprite — decisión de origen del arte

No existe aún un sprite sheet oficial de 4 estados. En vez de bloquear el resto del
frontend esperando arte final, se genera un sprite propio con Node/`canvas`-less (buffer
PNG manual, sin dependencias) inspirado directamente en la silueta de
`imagen/personajeSpider.jpg`: sombrero de ala ancha, gafas rectangulares blancas
brillantes, silueta de un solo tono oscuro con el objeto en la mano cambiando de color
según el estado. Es **arte placeholder de producción** — coherente con la paleta y
reemplazable 1:1 más adelante sin tocar el componente `Mascot`, que sólo conoce el grid
de frames y el nombre del estado.

## 6. Accesibilidad — no negociable aunque el estilo sea "difícil"

- Contraste: todo texto de cuerpo (`pixel-mist` sobre `pixel-bg`/`pixel-bg2`) se validó
  ≥ 4.5:1. Los 4 colores de veredicto se usan siempre acompañados de **texto** (`CLEAN`,
  `SUSPICIOUS`, `MALICIOUS`, `UNKNOWN`) e ícono/forma, nunca solo color — un usuario con
  daltonismo no puede distinguir `pixel-suspicious` de `pixel-malicious` por matiz solo.
- La mascota es decorativa respecto del veredicto: el estado siempre se anuncia también
  en texto (`aria-live="polite"` en el panel de veredicto) — la animación no es el único
  canal de la información.
- Formulario: `<label>` asociado a cada input, mensajes de error de validación en texto,
  no solo color de borde.

## 7. Stack y por qué

- **TypeScript**, no JS plano. El contrato del backend tiene exactamente el tipo de forma
  que TypeScript existe para atrapar: una unión discriminada de 4 niveles y un
  `score: number | null` cuyo `null` es fácil de "perder" con `??`. Modelar
  `Verdict`/`SourceReport` como tipos de unión hace que `score ?? 0` o un `switch` sin
  rama `unknown` fallen en build, no en producción — exactamente la clase de bug que
  motivó el ADR 3. El backend es JS por convención propia (Node sin build step); el
  frontend sí tiene paso de build (Vite), así que el costo de adoptar TS es marginal.
- **Vite + React 18 + Tailwind 3** (config JS clásica, no el modo CSS-first de Tailwind 4)
  porque la tarea pide explícitamente tokens en `tailwind.config.js`.
- **`framer-motion`** limitado a transiciones de UI (aparición/desaparición del panel de
  resultado, cambios de historial) — nunca para el ciclo del sprite, que es CSS puro
  (`steps()`), como exige la regla dura del agente.

## 8. Capa de efectos "glitch"

Feedback directo tras probar la app: el diseño pixel art/retro se sentía "estático" para
un producto que literalmente escanea señales comprometidas. Se pidió explícitamente
sensación de "pantalla hackeada" — cortes, pixelación, interferencia — sin convertir la
UI en un espectáculo que tape el veredicto ni en un riesgo de accesibilidad fotosensible.

### 8.0 Corrección previa: el sprite no se parecía a la referencia

Antes de tocar el glitch, se re-revisó `imagen/personajeSpider.jpg` pixel a pixel contra
`public/sprites/mascot.png` y el parecido era insuficiente: la silueta anterior (un blob
con una gorra genérica) no tenía ni el ala ancha del sombrero, ni la franja de gafas
rectangular, ni el brazo extendido con el objeto claro que son las tres señas de identidad
más reconocibles de la referencia. Se rediseñó la grilla ASCII de
`scripts/generate-mascot-sprite.mjs` (y su espejo en `scripts/generate-favicon.mjs`) para
capturar esas tres señas dentro del mismo presupuesto de 16×16px sin dependencias:
copa cónica + ala de sombrero de una sola barra ancha (fila 5, más ancha que la cabeza y
que los hombros), franja de gafas de una sola pieza (en vez de dos "ojos" separados,
igual que la referencia) y un brazo que sale del torso hacia el borde derecho del frame
terminando en el objeto claro (`O`), en vez de un objeto flotando simétrico bajo el
cuerpo. La pose de piernas se mantiene esquemática (16px da para muy poco detalle de
piernas), pero la lectura "sombrero de ala ancha + gafas + brazo con arma" — que es lo que
hace reconocible a la referencia en una miniatura — ahora sí está presente. El script se
corrió (`node scripts/generate-mascot-sprite.mjs && node scripts/generate-favicon.mjs`) y
el resultado se inspeccionó ampliado 10× antes de continuar.

### 8.1 Qué efectos, dónde, y por qué (no los diez a la vez)

Del repertorio completo (screen tear, RGB split, pixelación momentánea, static/noise,
scanline flicker) se usan los cinco, pero repartidos con un criterio: **la intensidad y
el color del glitch anticipan y refuerzan el significado del momento**, nunca decoran sin
motivo.

| Disparador | Efectos | Color/tono | Duración | Por qué |
|---|---|---|---|---|
| **Ambiental** (toda la página, `GlitchOverlay` + `useAmbientGlitch`) | RGB split leve (`drop-shadow` sin blur), screen tear (dos barras que se desplazan y vuelven), pixelación momentánea (`background-size` salta de 3px a 9–14px y vuelve), ruido fino (`repeating-conic-gradient`) | Neutro: `pixel-mist`/`pixel-glow`/`pixel-slate` — nunca rojo ni violeta, para no insinuar un veredicto falso cuando no hay ninguno en pantalla | ~240ms, cada 9–16s (aleatorio) | "El sistema que vigila amenazas también es observable vigilando" — inestabilidad ambiental de fondo, no ligada a ningún resultado. |
| **Scanlines base** (`fx-scanlines`, siempre montado) | Textura de líneas horizontales con una respiración de opacidad muy lenta (5s) | — | Continuo, amplitud mínima (0.16↔0.26) | El clásico "aire" CRT del pixel art, intensificado apenas como base permanente en vez de un one-off — es el único efecto que no necesita disparo. |
| **`scanning`** (mascota, `fx-jitter-scanning`) | Un guiño de RGB split muy breve dentro de cada ciclo de 1.4s | `pixel-glow` | Continuo mientras dura la consulta, amplitud mínima | "Procesando bajo carga" — sutil a propósito, la mascota ya se mueve más rápido en su propio ciclo de sprite; el glitch sólo acompaña. |
| **`malicious`** (mascota + `VerdictPanel`, `fx-burst-malicious` + `fx-noise-burst`) | RGB split marcado + jitter horizontal + ráfaga de estática — el combo más "ruidoso" del set | `pixel-malicious` (rojo) | Un solo ciclo de 560ms, disparado al revelarse el resultado | Es el peor veredicto posible; el glitch más fuerte se reserva para él y sólo para él (`suspicious` no lo dispara) — refuerza "algo anda mal" exactamente en el instante en que se sabe. |
| **`unknown`/`confused`** (mascota + `VerdictPanel`, `fx-burst-unknown` al revelarse + `fx-jitter-confused` continuo mientras se muestra) | RGB split + un leve `skew`, sin ruido/estática; jitter continuo errático (saltos de 1px en momentos irregulares del ciclo, no una sinusoide) | `pixel-unknown` (violeta) | Ráfaga: 480ms un ciclo. Jitter continuo: periodo de 2.4s, amplitud 1px | "No se pudo evaluar" no es lo mismo que "amenaza confirmada" — deliberadamente más silencioso que `malicious` (sin ruido) pero más **errático** que cualquier otro estado (es el único con jitter continuo), coherente con la mascota `confused` que ya es la más distinta de las cuatro. |

`clean` y `suspicious` no disparan ningún glitch de veredicto — sólo cuentan con el halo de
color que ya existía. Reservar el glitch fuerte para `malicious` (y una variante más suave
y distinta para `unknown`) es la decisión de diseño central de esta capa: si todo
glitchea, nada comunica.

### 8.2 Cómo se degradan con `prefers-reduced-motion: reduce`

Bloque único al final de `styles/index.css` (`@media (prefers-reduced-motion: reduce)`)
que pone `animation: none !important` en las nueve clases de esta capa. Las scanlines no
desaparecen del todo (se quedan como textura estática en `opacity: 0.16`, sin
`animation`) para no perder la identidad retro de base; el overlay ambiental si se oculta
por completo (`display: none`), porque no tiene ninguna función informativa. Además,
`useAmbientGlitch` comprueba `matchMedia('(prefers-reduced-motion: reduce)')` **antes** de
programar el primer `setTimeout` — con reduced motion activo, el temporizador de ráfagas
ambientales ni siquiera se arma (no es sólo que la animación quede en `none`, es que la
capa de orquestación tampoco intenta disparar nada), y se re-evalúa en vivo si el usuario
cambia la preferencia del SO sin recargar la pestaña.

### 8.3 Por qué es seguro para fotosensibilidad (WCAG 2.3.1)

- Ningún efecto alterna opacidad/brillo de forma repetida y sostenida: los "one-shot"
  (`malicious`, `unknown`, ambiental) son un solo ciclo de `steps()` de ≤560ms —
  transiciones de posición/filtro, no parpadeos de luz-oscuridad — y no se repiten hasta
  el próximo evento (siguiente scan, o el próximo intervalo aleatorio de 9-16s del
  ambiental).
- Los efectos continuos (`fx-jitter-confused`, `fx-jitter-scanning`, la respiración de
  scanlines) tienen periodos de 1.4s–5s: muy por debajo de la banda de parpadeo
  peligrosa (3–60Hz) — son casi imperceptiblemente lentos comparados con un strobe.
- Ninguno cubre un área grande de la pantalla con alto contraste sostenido: el overlay
  ambiental usa opacidades de 0.06–0.12 con `mix-blend-mode: overlay`, muy por debajo del
  umbral de "flash" de la norma incluso si se ignorara todo lo anterior.

### 8.4 Legibilidad y performance

- El glitch del veredicto vive en el `<Card>`, nunca en el `motion.div` de `framer-motion`
  que lo envuelve (ese ya anima `opacity`/`transform` inline por frame; una animación CSS
  con las mismas propiedades en el mismo nodo se pelearía con eso). Esto también evita
  que el glitch retrase la aparición del texto del veredicto — el `<Card>` remonta y el
  texto está legible antes de que termine el ciclo de 560ms.
- Todas las animaciones usan `transform`/`filter`/`opacity`/`background-position`/
  `background-size` — nunca `width`/`height`/`top`/`left` — así que sólo disparan
  paint/composite, no layout. Verificado sin jank visible en Chromium (DevTools
  Performance) durante la ráfaga `malicious` y el jitter continuo de `confused`.
- La mascota necesita **tres** nodos anidados (halo → burst → sprite) precisamente para
  que el jitter continuo del halo y la ráfaga puntual del burst no compitan por la misma
  propiedad `animation` en el mismo elemento — dos clases con `animation` en un solo nodo
  no se combinan, la última en cascada gana y la otra se pierde.
