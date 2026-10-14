const sdk = require('@dcl/eslint-config/sdk.config')

module.exports = [
  {
    ignores: [
      'dist/',
      'coverage/',
      'docs/',
      'scripts/',
      'jest.config.js',
      'eslint.config.js',
      'orval.config.ts',
      'src/contracts-snapshots/data.ts'
    ]
  },
  ...sdk,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './test/tsconfig.json']
      }
    }
  }
]
