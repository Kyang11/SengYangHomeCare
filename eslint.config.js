module.exports = [{ ignores: ['node_modules/**', 'dist/**', 'artifacts/**'] }, {
  files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
  rules: { 'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'valid-typeof': 'error', 'constructor-super': 'error' }
}];
