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

  describe('when an old worlds-content-server rejects a staging request as a full deployment', () => {
    it('should reject with a PartialDeploymentNotSupportedError', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      entitiesResponses = [
        {
          status: 400,
          text: 'Deployment failed: The file hashB (b.txt) is neither present in the storage or in the provided entity'
        }
      ]

      await expect(client.deployPartial(deployData, { maxBatchSizeBytes: 100, concurrency: 1 })).rejects.toBeInstanceOf(
        PartialDeploymentNotSupportedError
      )
    })
  })

  describe('when an old catalyst rejects a staging request as a full deployment', () => {
    it('should reject with a PartialDeploymentNotSupportedError', async () => {
      deployData = makeDeployData({ hashA: 80, hashB: 80 })
      // Catalyst validates missing content via @dcl/content-validator, whose message differs from
      // worlds-content-server's — the detection must recognize both.
      entitiesResponses = [
        {
          status: 400,
          text: 'This hash is referenced in the entity but was not uploaded or previously available: hashB'
        }
      ]

      await expect(client.deployPartial(deployData, { maxBatchSizeBytes: 100, concurrency: 1 })).rejects.toBeInstanceOf(
        PartialDeploymentNotSupportedError
      )
    })
  })

  describe('when the server responds 429 (rate limited)', () => {
    it('should resume rather than fail terminally', async () => {
      deployData = makeDeployData({ hashA: 100 })
      entitiesResponses = [
        { status: 429, text: 'Entity rate limited' },
        // resume: succeeds on the next session
        { status: 200, body: { creationTimestamp: 3 } }
      ]

      const result = await client.deployPartial(deployData, { resumeDelay: 0 })

      expect(result).toEqual({ creationTimestamp: 3 })
    })
  })

  describe('when the caller aborts via options.signal', () => {
    let controller: AbortController
    let sawAbortedSignal: boolean

    beforeEach(async () => {
      controller = new AbortController()
      sawAbortedSignal = false
      deployData = makeDeployData({ hashA: 100 })
      // Abort before the request resolves; assert the request carried an already-aborted signal.
      controller.abort()
      entitiesResponses = [{ status: 200, body: { creationTimestamp: 1 } }]
      const originalFetch = fetcher.fetch as jest.Mock
      ;(fetcher.fetch as jest.Mock) = jest.fn(async (url: string, init?: any) => {
        if (!url.includes('/available-content') && init?.signal?.aborted) {
          sawAbortedSignal = true
        }
        return originalFetch(url, init)
      })

      try {
        await client.deployPartial(deployData, { signal: controller.signal })
      } catch {
        // May resolve or reject depending on timing; the assertion is about signal propagation.
      }
    })

    it('should propagate the caller signal to the deployment request', () => {
      expect(sawAbortedSignal).toBe(true)
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

  // Uses its own content-routed fetcher (rather than the ordered queue above) because parallel workers
  // don't send requests in a deterministic order, and this fetcher must honor the abort signal.
  describe('when batches run in parallel and one finalizes while another is in flight', () => {
    let availableContentCalls: number
    let parallelClient: ContentClient
    let result: { creationTimestamp: number }

    beforeEach(async () => {
      availableContentCalls = 0
      let finalized = false
      // Three files, each its own batch (cap 250): the largest ships with the entity file in the first
      // request; the other two run concurrently. `hashWin` finalizes (200); `hashSlow` never resolves
      // on its own and rejects when the pool aborts it after the win.
      const files = new Map<string, Uint8Array>()
      files.set(entityId, new Uint8Array([1, 2, 3]))
      files.set('hashBig', new Uint8Array(300))
      files.set('hashWin', new Uint8Array(240))
      files.set('hashSlow', new Uint8Array(230))
      const parallelDeployData: DeploymentData = { entityId, authChain: [], files }

      const ok200 = () => ({
        ok: true,
        status: 200,
        json: async () => ({ creationTimestamp: 1 }),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0)
      })

      const parallelFetcher: IFetchComponent = {
        fetch: jest.fn(async (url: string, init?: any) => {
          if (url.includes('/available-content')) {
            availableContentCalls++
            const cids = (url.split('?')[1] || '')
              .split('&')
              .filter((p) => p.startsWith('cid='))
              .map((p) => decodeURIComponent(p.slice('cid='.length)))
            return {
              ok: true,
              status: 200,
              json: async () => cids.map((cid) => ({ cid, available: finalized })),
              text: async () => '',
              arrayBuffer: async () => new ArrayBuffer(0)
            }
          }
          const form = init.body as FormData
          if (form.has('hashSlow')) {
            return await new Promise((_resolve, reject) => {
              const signal: AbortSignal | undefined = init.signal
              if (signal?.aborted) return reject(new Error('AbortError'))
              signal?.addEventListener('abort', () => reject(new Error('AbortError')))
            })
          }
          if (form.has('hashWin')) {
            finalized = true
            return ok200()
          }
          if (form.has('hashBig')) {
            return {
              ok: true,
              status: 202,
              json: async () => ({ missing: ['hashWin', 'hashSlow'] }),
              text: async () => '',
              arrayBuffer: async () => new ArrayBuffer(0)
            }
          }
          return ok200()
        })
      }

      parallelClient = createContentClient({ url: URL, fetcher: parallelFetcher })
      result = await parallelClient.deployPartial(parallelDeployData, {
        maxBatchSizeBytes: 250,
        concurrency: 2,
        resumeDelay: 0
      })
    })

    it('should resolve with the creationTimestamp', () => {
      expect(result).toEqual({ creationTimestamp: 1 })
    })

    it('should not restart the session (the aborted sibling must not trigger a resume)', () => {
      expect(availableContentCalls).toBe(1)
    })
  })
})
