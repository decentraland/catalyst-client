import { defineConfig } from 'orval'

export default defineConfig({
  catalyst: {
    input: './node_modules/@dcl/catalyst-api-specs/lib/api.yaml',
    output: {
      mode: 'split',
      target: './src/client/specs/client.ts'
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write'
    }
  }
})
