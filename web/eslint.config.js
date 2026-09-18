import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Unused arguments are allowed when prefixed with _, which is how the codebase
      // signals "required by the signature, deliberately ignored".
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests legitimately use console and non-component exports.
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off', 'react-refresh/only-export-components': 'off' },
  },
  {
    /**
     * These files deliberately export a provider component alongside its consumer hook
     * (or its nav config), which is the idiomatic React context pattern. Splitting them
     * purely to satisfy fast-refresh would scatter tightly coupled code across files.
     */
    files: [
      'src/hooks/useAuth.tsx',
      'src/hooks/useCart.tsx',
      'src/components/ui/Toast.tsx',
      'src/components/shop/VariantSelector.tsx',
      'src/components/layout/AdminSidebar.tsx',
      'src/i18n/I18nProvider.tsx',
      'src/components/ui/States.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
