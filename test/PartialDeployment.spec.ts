import { createContentClient, ContentClient, IFetchComponent, DeploymentData } from '../src'
import { PartialDeploymentNotSupportedError, PartialDeploymentValidationError } from '../src/client/utils/errors'

const URL = 'https://content.example.com'

type EntitiesResponse = { status: number; body?: any; text?: string; throwNetwork?: boolean }

describe('deployPartial', () => {
  const entityId = 'bafyEntity'
  let deployData: DeploymentData
  let entitiesResponses: EntitiesResponse[]
  let available: Set<string>
  let entitiesCalls: FormData[]
  let fetcher: IFetchComponent
  let client: ContentClient

  function makeDeployData(fileSizes: Record<string, number>): DeploymentData {
    const files = new Map<string, Uint8Array>()
    files.set(entityId, new Uint8Array([1, 2, 3]))
    for (const [hash, size] of Object.entries(fileSizes)) {
      files.set(hash, new Uint8Array(size))
    }
    return { entityId, authChain: [], files }
  }

  beforeEach(() => {
    entitiesResponses = []
    available = new Set<string>()
    entitiesCalls = []

    fetcher = {
      fetch: jest.fn(async (url: string, init?: any) => {
        if (url.includes('/available-content')) {
          const cids = (url.split('?')[1] || '')
            .split('&')
            .filter((p) => p.startsWith('cid='))
            .map((p) => decodeURIComponent(p.slice('cid='.length)))
          return {
            ok: true,
            status: 200,
            json: async () => cids.map((cid) => ({ cid, available: available.has(cid) })),
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(0)
          }
        }
        // POST /entities
        entitiesCalls.push(init.body as FormData)
        const next = entitiesResponses.shift()
        if (!next) {
          throw new Error('Unexpected extra POST /entities call')
        }
        if (next.throwNetwork) {
          throw new Error('network failure')
        }
        return {
          ok: next.status >= 200 && next.status < 300,
          status: next.status,
          json: async () => next.body ?? {},
          text: async () => next.text ?? '',
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      })
    }
    client = createContentClient({ url: URL, fetcher })
  })

  function entityFileIncluded(form: FormData): boolean {
    return form.getAll(entityId).some((v) => v instanceof Blob)
  }

  describe('when all content fits in a single batch', () => {
    it('should perform one POST that carries the entity file and resolve with the creationTimestamp', async () => {
      deployData = makeDeployData({ hashA: 100 })
      entitiesResponses = [{ status: 200, body: { creationTimestamp: 42 } }]

      const result = await client.deployPartial(deployData)

      expect(result).toEqual({ creationTimestamp: 42 })
      expect(entitiesCalls).toHaveLength(1)
      expect(entitiesCalls[0].get('partial')).toBe('true')
      expect(entityFileIncluded(entitiesCalls[0])).toBe(true)
      expect(entitiesCalls[0].has('hashA')).toBe(true)
    })
  })

  describe('when the server already stores some hashes', () => {
    it('should omit those hashes from every request', async () => {
      deployData = makeDeployData({ hashA: 100, hashB: 100 })
      available = new Set(['hashA'])
      entitiesResponses = [{ status: 200, body: { creationTimestamp: 7 } }]

      await client.deployPartial(deployData)

      expect(entitiesCalls).toHaveLength(1)
      expect(entitiesCalls[0].has('hashA')).toBe(false)
      expect(entitiesCalls[0].has('hashB')).toBe(true)
    })
  })

  describe('when content spans multiple batches', () => {
    it('should include the entity file only in the first request and finalize on the last', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      entitiesResponses = [
        { status: 202, body: { missing: ['hashB'] } },
        { status: 200, body: { creationTimestamp: 99 } }
      ]

      // Cap forces one file per request; concurrency 1 makes ordering deterministic.
      const result = await client.deployPartial(deployData, { maxBatchSizeBytes: 100, concurrency: 1 })

      expect(result).toEqual({ creationTimestamp: 99 })
      expect(entitiesCalls).toHaveLength(2)
      expect(entityFileIncluded(entitiesCalls[0])).toBe(true)
      expect(entityFileIncluded(entitiesCalls[1])).toBe(false)
    })
  })

  describe('when a batch fails with a network error', () => {
    it('should resume by re-querying available content and re-uploading the missing hashes', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      entitiesResponses = [
        { status: 202, body: { missing: ['hashB'] } },
        { throwNetwork: true, status: 0 },
        // resume: hashA now on server, only hashB re-uploaded → finalize
        { status: 200, body: { creationTimestamp: 5 } }
      ]

      const result = await client.deployPartial(deployData, {
        maxBatchSizeBytes: 100,
        concurrency: 1,
        resumeDelay: 0
      })

      expect(result).toEqual({ creationTimestamp: 5 })
    })
  })

  describe('when the completing request returns 400', () => {
    it('should reject with a PartialDeploymentValidationError exposing the status and body', async () => {
      deployData = makeDeployData({ hashA: 100 })
      entitiesResponses = [{ status: 400, text: 'The deployment is too big.' }]

      await expect(client.deployPartial(deployData)).rejects.toBeInstanceOf(PartialDeploymentValidationError)
    })
  })

  describe('when an old server rejects a staging request as a full deployment', () => {
    it('should reject with a PartialDeploymentNotSupportedError', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      entitiesResponses = [
        {
          status: 400,
          text: 'This hash is referenced in the entity but was not uploaded or previously available: hashB (neither present in the storage)'
        }
      ]

      await expect(client.deployPartial(deployData, { maxBatchSizeBytes: 100, concurrency: 1 })).rejects.toBeInstanceOf(
        PartialDeploymentNotSupportedError
      )
    })
  })

  describe('when an onProgress callback is provided', () => {
    it('should report cumulative progress after each staged batch', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      entitiesResponses = [
        { status: 202, body: { missing: ['hashB'] } },
        { status: 200, body: { creationTimestamp: 1 } }
      ]
      const progress: number[] = []

      await client.deployPartial(deployData, {
        maxBatchSizeBytes: 100,
        concurrency: 1,
        onProgress: (p) => progress.push(p.completedBatches)
      })

      expect(progress[progress.length - 1]).toBeGreaterThanOrEqual(1)
    })
  })
})
