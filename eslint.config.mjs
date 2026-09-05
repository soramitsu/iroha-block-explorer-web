import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

const vueRecommendedConfig = require('eslint-plugin-vue/lib/configs/vue3-recommended');

const legacyConfig = {
  plugins: ['@stylistic/ts'],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  globals: {
    defineProps: 'readonly',
    defineEmits: 'readonly',
    defineExpose: 'readonly',
    withDefaults: 'readonly',
  },
  rules: {
    'vue/html-indent': ['warn', 2],
    'no-unused-vars': ['warn'],
    'spaced-comment': ['error', 'always', { markers: ['/'] }],
    'no-undef': ['off'],
    '@typescript-eslint/no-unused-vars': ['off'],
    '@typescript-eslint/explicit-member-accessibility': ['off'],
    '@typescript-eslint/no-parameter-properties': ['off'],
    '@typescript-eslint/unified-signatures': ['off'],
    'vue/v-bind-style': ['error', 'shorthand', { sameNameShorthand: 'always' }],
    'vue/no-bare-strings-in-template': [
      'error',
      {
        allowlist: [
          '(',
          ')',
          ',',
          '.',
          '&',
          '+',
          '-',
          '=',
          '*',
          '/',
          '#',
          '%',
          '!',
          '?',
          ':',
          '[',
          ']',
          '{',
          '}',
          '<',
          '>',
          '·',
          '•',
          '‐',
          '–',
          '—',
          '−',
          '|',
          '/^\\d+$/',
          'NetworkId',
          'OperatorSigningContext',
          'Hyperledger Iroha',
          'X-Iroha-Account',
          'X-Iroha-Signature',
          'X-Iroha-Timestamp-Ms',
          'X-Iroha-Nonce',
          'X-Iroha-Witness',
          'SetKeyValue',
          'RemoveKeyValue',
          'ExecuteTrigger',
          'SetParameter',
          'canonical-rust-service',
          'sign_raw',
          'config.json',
          'result_ok',
          'content_bytes',
          'approved_epoch',
          'retention_epoch',
          'storage_class',
          'min_replicas',
          'retirement_reason',
          'chunk_digest_sha3_256',
          'por_root',
          'council_envelope_digest',
          '/metrics',
          '/status',
          '/^\\/v1\\/gov\\/\\*$/',
          '/^\\/v1\\/gov\\/capabilities$/',
        ],
        attributes: {
          '/.+/': ['title', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext'],
          input: ['placeholder'],
          img: ['alt'],
        },
        directives: ['v-text'],
      },
    ],
    '@stylistic/ts/member-delimiter-style': [
      'warn',
      {
        multiline: {
          delimiter: 'none',
          requireLast: false,
        },
        singleline: {
          delimiter: 'comma',
          requireLast: false,
        },
        multilineDetection: 'brackets',
      },
    ],
  },
};

export default [
  {
    ignores: ['node_modules', 'dist', 'dist-ts', '.mochi', '.mochi/**', '.venv', '.venv/**', '.venv-*', '.venv-*/**'],
  },
  ...compat.extends('alloy', 'alloy/typescript'),
  ...compat.config(vueRecommendedConfig),
  ...compat.config(legacyConfig),
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'max-params': 'off',
      'vue/one-component-per-file': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-prop-types': 'off',
    },
  },
  {
    files: [
      'src/features/studio/**/*.ts',
      'src/features/studio/**/*.vue',
      'src/shared/lib/connect.ts',
      'src/shared/lib/contract-view.ts',
      'src/shared/lib/kotodama-studio-compiler/**/*.ts',
      'src/shared/lib/kotodama-studio-graph.ts',
      'src/shared/lib/kotodama-studio-semantics.ts',
    ],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/member-ordering': 'off',
      complexity: 'off',
      'max-params': 'off',
    },
  },
];
