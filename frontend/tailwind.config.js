/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Paleta restringida de 13 tokens. Documentada en
      // docs/architecture/frontend-design.md — cualquier color usado en un
      // componente debe pasar por uno de estos nombres, nunca `bg-[#...]`.
      colors: {
        pixel: {
          bg: '#0a0a0f',
          bg2: '#12121a',
          ink: '#1c1f2b',
          ink2: '#2a2e3f',
          slate: '#3d4256',
          fog: '#6b7280',
          mist: '#a8b0c3',
          glass: '#f4f6fb',
          glow: '#dce8ff',
          clean: '#3ddc84',
          suspicious: '#f5c542',
          malicious: '#e5484d',
          unknown: '#9b8cff',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        'mono-pixel': ['"VT323"', 'monospace'],
      },
      borderRadius: {
        none: '0px',
      },
      boxShadow: {
        // "Sombra" pixel: bloque sólido desplazado, nunca blur.
        pixel: '4px 4px 0 0 rgb(42 46 63 / 1)',
        'pixel-sm': '2px 2px 0 0 rgb(42 46 63 / 1)',
      },
      keyframes: {
        // Técnica estándar de animación por sprite sheet: el recorrido total
        // es `numFrames * frameHeight` en `background-position-y`, y
        // `animation-timing-function: steps(numFrames)` (ver clases
        // `.animate-mascot-*` más abajo) hace que el navegador salte de frame
        // en frame en vez de interpolar. La columna (estado) se fija aparte,
        // en línea, vía `background-position-x`; este keyframe sólo mueve Y.
        // El alto de frame se pasa por la variable CSS `--mascot-frame`.
        'mascot-cycle': {
          from: { backgroundPositionY: '0px' },
          to: { backgroundPositionY: 'calc(-2 * var(--mascot-frame, 128px))' },
        },
      },
      animation: {
        'mascot-idle': 'mascot-cycle 1.2s steps(2) infinite',
        'mascot-scanning': 'mascot-cycle 0.35s steps(2) infinite',
        'mascot-calm': 'mascot-cycle 1.8s steps(2) infinite',
        'mascot-alert': 'mascot-cycle 0.3s steps(2) infinite',
        'mascot-confused': 'mascot-cycle 0.6s steps(2) infinite',
      },
    },
  },
  plugins: [],
};
