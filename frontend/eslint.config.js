import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `.vite` es la cache de pre-bundling que deja el dev server y `coverage` la de
  // vitest: ambas son artefactos locales (gitignorados) con codigo de terceros que
  // ensucia el lint. Sin esto, `npm run lint` falla en cualquier maquina que haya
  // levantado el dev server, aunque el codigo propio este impecable.
  { ignores: ['dist', '.vite', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
