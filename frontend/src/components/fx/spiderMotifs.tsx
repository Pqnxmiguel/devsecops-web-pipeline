import type { HTMLAttributes, SVGProps } from 'react';

/**
 * Motivos decorativos del fondo ambiental (ver `ThreatBackdrop.tsx`): una
 * araña y una telaraña de esquina. Ambos comparten el mismo lenguaje visual
 * "pixel-art fotográfico" que ya rige el sprite de la mascota
 * (`scripts/generate-mascot-sprite.mjs`: downsampling algorítmico de una foto
 * real, nunca redibujado a mano) — ver
 * docs/architecture/frontend-design.md §11 para el porqué de reemplazar el
 * vector de líneas rectas de la versión anterior.
 */

/**
 * Silueta de araña: NO es un SVG vectorial, es una máscara PNG
 * (`public/sprites/backdrop-spider.png`) generada por
 * `scripts/generate-backdrop-spider.mjs` downsampleando la foto real
 * `imagen/araña.png` — el mismo criterio de origen del arte que el sprite de
 * la mascota, aplicado acá a un elemento puramente decorativo.
 *
 * Técnica: `mask-image` con el PNG como máscara alfa + `background-color:
 * currentColor` (clase Tailwind `bg-current`, no un color nuevo) sobre el
 * elemento. Esto preserva EXACTAMENTE la misma capacidad de tinte dinámico
 * que tenía la versión SVG con `fill="currentColor"`: quien envuelve este
 * componente sigue fijando el color con una clase `text-pixel-*`
 * (`threatTintClassFor`, `components/mascot/mascotState.ts`) y ese color se
 * propaga a `currentColor` sin que este componente conozca la paleta.
 * `image-rendering: pixelated` sobre el propio elemento enmascarado evita que
 * el navegador interpole la máscara al escalarla — mismo requisito duro que
 * rige todo sprite escalado del proyecto.
 */
export function SpiderSilhouette({ className = '', style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`bg-current ${className}`}
      style={{
        WebkitMaskImage: 'url(/sprites/backdrop-spider.png)',
        maskImage: 'url(/sprites/backdrop-spider.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        imageRendering: 'pixelated',
        ...style,
      }}
      {...rest}
    />
  );
}

/**
 * Rasterizador de línea de Bresenham sobre una grilla entera: produce el
 * mismo "escalonado" en bloques que un pixel-art real dibuja a mano para una
 * diagonal, en vez de la diagonal perfectamente recta que traza un `<line>`
 * SVG. Es lo que hace que `WebMotif` pertenezca a la misma familia visual que
 * la máscara de la araña (bloques sólidos, quiebres en escalón) en vez de
 * verse como un vector geométrico separado.
 */
function rasterizeLine(x0: number, y0: number, x1: number, y1: number, out: Set<string>): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - cx);
  const dy = -Math.abs(ey - cy);
  const sx = cx < ex ? 1 : -1;
  const sy = cy < ey ? 1 : -1;
  let err = dx + dy;
  while (true) {
    out.add(`${cx},${cy}`);
    if (cx === ex && cy === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

const WEB_SPOKE_COUNT = 8;
const WEB_RING_FRACTIONS = [0.35, 0.65, 1] as const;
const WEB_GRID = 24; // grilla entera del "pixel raster" — chunky a propósito, misma escala de bloque que la máscara de la araña (40x40 sobre una silueta de ~19 bloques nativos).
const WEB_RADIUS = 11;
const WEB_CENTER = 12;

function webPointAt(angleDeg: number, radius: number): readonly [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [WEB_CENTER + radius * Math.cos(rad), WEB_CENTER + radius * Math.sin(rad)];
}

const WEB_ANGLES = Array.from({ length: WEB_SPOKE_COUNT }, (_, i) => (360 / WEB_SPOKE_COUNT) * i);

/** Grilla de celdas "encendidas" (hilos radiales + anillos poligonales), calculada una sola vez a nivel de módulo — es geometría fija, no depende de props. */
const WEB_CELLS: readonly (readonly [number, number])[] = (() => {
  const cells = new Set<string>();
  WEB_ANGLES.forEach((angle) => {
    const [x, y] = webPointAt(angle, WEB_RADIUS);
    rasterizeLine(WEB_CENTER, WEB_CENTER, x, y, cells);
  });
  WEB_RING_FRACTIONS.forEach((fraction) => {
    const vertices = WEB_ANGLES.map((angle) => webPointAt(angle, WEB_RADIUS * fraction));
    vertices.forEach(([x0, y0], i) => {
      const [x1, y1] = vertices[(i + 1) % vertices.length]!;
      rasterizeLine(x0, y0, x1, y1, cells);
    });
  });
  return [...cells].map((key) => {
    const [xStr = '0', yStr = '0'] = key.split(',');
    return [Number(xStr), Number(yStr)] as const;
  });
})();

/**
 * Telaraña de esquina: los mismos hilos radiales + anillos poligonales de
 * siempre, pero rasterizados a bloques de 1 celda de grilla (Bresenham) en
 * vez de trazados como `<line>`/`<polygon>` de líneas perfectamente rectas —
 * así comparte el lenguaje "pixel-art" bloqueado de la máscara de la araña en
 * vez de leerse como un vector geométrico aparte. Sigue siendo SVG puro con
 * `fill="currentColor"` (nunca un PNG): no necesita venir de una foto de
 * referencia para pertenecer a la misma familia visual, sólo necesita
 * bloques en vez de líneas finas. Centro posicionado fuera del viewport (ver
 * `ThreatBackdrop`) para que sólo se vea el cuarto de tela que cae dentro de
 * la esquina real de la pantalla.
 */
export function WebMotif(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={`0 0 ${WEB_GRID} ${WEB_GRID}`} shapeRendering="crispEdges" fill="currentColor" {...props}>
      {WEB_CELLS.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}
