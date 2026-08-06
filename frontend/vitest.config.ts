import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // testing-library/react registra su cleanup automático (`afterEach`)
    // detectando globals de test; sin esto, el DOM de un `render()` se
    // filtra al siguiente test dentro del mismo archivo.
    globals: true,
  },
});
