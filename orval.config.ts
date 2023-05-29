import { defineConfig } from 'orval'

export default defineConfig({
  catalyst: {
    input: './node_modules/@dcl/catalyst-api-specs/lib/api.yaml',
    output: {
      mode: 'split',
      target: './src/client/specs/catalyst.ts'
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write'
    }
  },
  lambdas: {
    input: {
      target: './node_modules/@dcl/catalyst-api-specs/lib/api.yaml',
      filters: {
        tags: ['Lambdas']
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
      afterAllFilesWrite: 'prettier --write'
    }
  }
})
