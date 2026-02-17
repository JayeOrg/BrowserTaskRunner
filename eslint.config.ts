import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { configs as sonarConfigs } from 'eslint-plugin-sonarjs'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'eslint.config.ts',
      'vitest.config.ts',
      // Ignore non-TypeScript config files
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },

  // Core ESLint – all rules
  js.configs.all,

  // SonarJS maintainability rules
  sonarConfigs.recommended,

  // TypeScript strict type-checked rules
  ...tseslint.configs.strictTypeChecked,

  {
    files: ['stack/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript strictness
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',

      // Core ESLint rule adjustments
      'no-use-before-define': 'off',
      'no-await-in-loop': 'off',
      'no-plusplus': 'off',
      'no-shadow': 'error',
      'new-cap': 'off',
      'class-methods-use-this': 'off',
      'no-ternary': 'off',
      'max-params': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'max-statements': 'off',
      'func-style': 'off',
      'one-var': 'off',
      'no-empty-function': 'off',
      'no-inline-comments': 'off',
      'no-magic-numbers': 'off',
      'prefer-destructuring': 'off',
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: true },
      ],
      'no-negated-condition': 'off',
      'no-undefined': 'off',
      'no-void': 'off',
      'sort-imports': 'off',
      'dot-notation': 'off',
      'init-declarations': 'off',
      'sort-keys': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/pseudo-random': 'off',
      'id-length': ['error', { exceptions: ['x', 'y'] }],
    },
  },

  // Infra scripts – intentionally run OS commands and write to /tmp
  {
    files: ['stack/infra/*.ts'],
    rules: {
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/os-command': 'off',
      'sonarjs/publicly-writable-directories': 'off',
      'camelcase': 'off',
    },
  },

  // Tests – relaxed rules
  {
    files: ['**/*.{spec,test}.ts', 'tests/fixtures/**/*.ts', 'tests/setup/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      'no-console': 'off',
      'max-lines': 'off',
      'no-magic-numbers': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-os-command-from-path': 'off',
    },
  },

  // Prettier – must be last to override formatting rules
  eslintConfigPrettier,
  eslintPluginPrettier,
]
