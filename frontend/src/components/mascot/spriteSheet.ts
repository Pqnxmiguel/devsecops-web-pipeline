/**
 * Geometría del sprite sheet — separada de `mascotState.ts` a propósito: ese
 * archivo es el contrato protegido (estado ⇄ veredicto, `assertUnreachable`)
 * y no debe tocarse solo porque cambió el arte. Estos números deben
 * coincidir con `scripts/generate-mascot-sprite.mjs` (comentario cruzado en
 * ambos lados).
 *
 * El frame ya NO es cuadrado (antes 16×16 con arte placeholder dibujado a
 * mano): la referencia real `imagen/spider.png` es más alta que ancha, así
 * que el frame generado por downsampling es 32×40 — ver
 * docs/architecture/frontend-design.md.
 */
export const NATIVE_FRAME_W = 32;
export const NATIVE_FRAME_H = 40;
export const SHEET_COLS = 4; // idle | calm | alert | confused
export const SHEET_ROWS = 2; // 2 frames de animación por estado
