import type { SVGProps } from 'react';

/**
 * Motivos SVG puramente decorativos del fondo ambiental (ver
 * `ThreatBackdrop.tsx`): una araña y una telaraña de esquina. Vectores de
 * líneas RECTAS únicamente — nunca arcos ni curvas suaves — mismo criterio de
 * "bordes duros, sin difuminado" que ya rige el resto de la identidad visual
 * (ver docs/architecture/frontend-design.md §3) y el mismo espíritu de
 * pixel-grid que `scripts/generate-mascot-sprite.mjs` usa para el sprite de
 * la mascota (bloques sólidos + quiebres en ángulo recto, nunca diagonales
 * suaves de más de un segmento). Coloreados con `stroke="currentColor"` /
 * `fill="currentColor"` — nunca un color propio — así heredan el tinte de
 * amenaza que aplica `ThreatBackdrop` vía clases `text-pixel-*`
 * (`threatTintClassFor`, `components/mascot/mascotState.ts`).
 */

/**
 * Silueta de araña: dos bloques sólidos (cefalotórax + abdomen) más 8 patas,
 * cada una un quiebre de dos segmentos rectos (nunca una curva) — el mismo
 * lenguaje de "sprite" que el resto de la mascota, aplicado acá como vector
 * en vez de un sheet PNG porque es un elemento puramente decorativo de baja
 * opacidad que no necesita animarse fotograma a fotograma.
 */
export function SpiderSilhouette(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 44"
      shapeRendering="crispEdges"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      {/* cuerpo: cefalotórax + abdomen, dos bloques sólidos superpuestos */}
      <rect x="26" y="17" width="10" height="8" fill="currentColor" stroke="none" />
      <rect x="21" y="20" width="20" height="16" fill="currentColor" stroke="none" />

      {/* patas: 4 por lado, cada una M-L-L (dos segmentos rectos, nunca una curva) */}
      <path d="M27,19 L14,10 L3,13" />
      <path d="M24,22 L9,18 L1,21" />
      <path d="M24,27 L9,30 L1,28" />
      <path d="M27,30 L14,38 L4,41" />
      <path d="M35,19 L48,10 L59,13" />
      <path d="M38,22 L53,18 L61,21" />
      <path d="M38,27 L53,30 L61,28" />
      <path d="M35,30 L48,38 L58,41" />
    </svg>
  );
}

const WEB_SPOKE_COUNT = 8;
const WEB_RING_FRACTIONS = [0.35, 0.65, 1] as const;
const WEB_RADIUS = 46;
const WEB_CENTER = 48;

function webPointAt(angleDeg: number, radius: number): readonly [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [WEB_CENTER + radius * Math.cos(rad), WEB_CENTER + radius * Math.sin(rad)];
}

const WEB_ANGLES = Array.from({ length: WEB_SPOKE_COUNT }, (_, i) => (360 / WEB_SPOKE_COUNT) * i);

/**
 * Telaraña de esquina: hilos radiales (8, ángulos exactos, líneas rectas) +
 * anillos POLIGONALES (nunca círculos concéntricos — una telaraña real es
 * poligonal, no circular, así que esto es a la vez más fiel al referente y
 * más consistente con "sin curvas"). Pensada para posicionarse con su centro
 * FUERA del viewport (ver `ThreatBackdrop`) de forma que sólo se vea el
 * cuarto de tela que cae dentro de la esquina real de la pantalla.
 */
export function WebMotif(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 96 96" shapeRendering="crispEdges" fill="none" stroke="currentColor" strokeWidth={1} {...props}>
      {WEB_ANGLES.map((angle) => {
        const [x, y] = webPointAt(angle, WEB_RADIUS);
        return <line key={`spoke-${angle}`} x1={WEB_CENTER} y1={WEB_CENTER} x2={x} y2={y} />;
      })}
      {WEB_RING_FRACTIONS.map((fraction) => (
        <polygon
          key={`ring-${fraction}`}
          points={WEB_ANGLES.map((angle) => webPointAt(angle, WEB_RADIUS * fraction).join(',')).join(' ')}
        />
      ))}
    </svg>
  );
}
