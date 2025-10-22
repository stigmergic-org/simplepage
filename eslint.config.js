import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.pnpm-store/**',
      '**/lib/**',
      'contracts/**',
      'frontend/public/**',
      '**/*.min.js',
      'pnpm-lock.yaml',
    ],
  },

  // Base config for all JavaScript files
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // CommonJS files
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  // React/JSX files (frontend)
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        process: 'readonly', // Webpack provides process
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react-hooks/exhaustive-deps': 'warn', // Warn instead of error for missing deps
    },
  },

  // Frontend webpack config
  {
    files: ['frontend/webpack.config.js', 'frontend/**/*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
      },
    },
  },

  // Browser-compatible packages (repo package runs in browser)
  {
    files: ['packages/repo/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },

  // Test files
  {
    files: ['**/test/**/*.js', '**/tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser, // Tests may use browser globals like DOMParser
      },
    },
    rules: {
      'no-unused-expressions': 'off',
      'no-unused-vars': 'warn', // Warn instead of error for unused vars in tests
      'no-case-declarations': 'warn', // Warn instead of error for case declarations in tests
    },
  },

  // Config files
  {
    files: [
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/setup-*.js',
      '**/webpack.config.js',
      '**/postcss.config.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

