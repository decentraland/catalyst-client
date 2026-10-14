import { defineConfig } from 'orval'

export default defineConfig({
  catalyst: {
    input: './node_modules/@dcl/catalyst-api-specs/lib/api.yaml',
    output: {
      mode: 'split',
      target: './src/client/specs/catalyst.ts'
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write --ignore-path .prettierignore'
    }
  },
  lambdas: {
    input: {
      target: './node_modules/@dcl/catalyst-api-specs/lib/api.yaml',
      filters: {
        tags: ['Lambdas'],
        // orval >= 7 prunes schemas the filtered operations don't reference
        includeUnreferencedSchemas: true
      }
    },
    output: {
      target: './src/client/specs/lambdas-client.ts',
      override: {
        mutator: {
          path: './src/client/utils/fetcher.ts',
          name: 'useCustomClient'
        }
      }
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write --ignore-path .prettierignore'
    }
  }
})
