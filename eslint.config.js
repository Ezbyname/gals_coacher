// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'coverage/*', 'android/*', 'ios/*'],
  },
  {
    // User-facing copy must come from t(); no text literals in screens/components.
    files: ['src/app/**/*.tsx', 'src/ui/**/*.tsx', 'src/features/**/*.tsx'],
    ignores: ['**/__tests__/**'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
]);
