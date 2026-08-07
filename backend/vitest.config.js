import { defineConfig } from 'vitest/config';
import { tmpdir } from 'node:os';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
    restoreMocks: true,
    env: {
      // Cualquier test que arme una app en modo real (p.ej. "todas las
      // fuentes caidas") construye un quotaTracker real. Sin este override
      // escribiria en `backend/data/quota-state.json`, el estado de cuota
      // real del operador. Los tests unitarios de quotaTracker igual
      // inyectan su propio `statePath` temporal y no dependen de esto.
      QUOTA_STATE_PATH: path.join(tmpdir(), 'ioc-scanner-tests', 'quota-state.json'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.js'],
    },
  },
});
