import { createServer, IncomingHttpHeaders, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { createFetchComponent } from '@dcl/fetch-component'
import { ContentClient, createContentClient, DeploymentData, IFetchComponent, UploadProgress } from '../src'
import * as uploadProgress from '../src/client/utils/upload-progress'
import { UPLOAD_SLICE_BYTES } from '../src/client/utils/upload-progress'

const URL = 'https://content.example.com'
const ENTITY_ID = 'bafyEntity'
const ENTITY_FILE = new Uint8Array([1, 2, 3])
const AUTH_CHAIN = [{ type: 'SIGNER', payload: '0xabc', signature: '' }] as DeploymentData['authChain']

type EntitiesReply = {
  status: number
  body?: any
  // Rejects before reading the body (e.g. the undici `duplex` TypeError).
  error?: Error
  // Stops reading after this many chunks and fails like a dropped connection.
  failAfterChunks?: number
}

type EntitiesCall = { url: string; init: any; received?: Uint8Array }

function makeDeployData(fileSizes: Record<string, number>): DeploymentData {
  const files = new Map<string, Uint8Array>()
  files.set(ENTITY_ID, ENTITY_FILE)
  for (const [hash, size] of Object.entries(fileSizes)) {
    files.set(hash, new Uint8Array(size).fill(hash.charCodeAt(hash.length - 1)))
  }
  return { entityId: ENTITY_ID, authChain: AUTH_CHAIN, files }
}

async function readStream(stream: ReadableStream<Uint8Array>, reply: EntitiesReply, onChunk: () => void) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    onChunk()
    if (reply.failAfterChunks !== undefined && chunks.length >= reply.failAfterChunks) {
      await reader.cancel()
      throw new Error('network failure')
    }
  }
  return new Uint8Array(Buffer.concat(chunks))
}

// Maps each form entry to its string value or its file bytes (base64) for comparison.
async function describeForm(form: FormData): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  for (const [name, value] of form.entries()) {
    entries[name] =
      typeof value === 'string' ? value : `file:${Buffer.from(await value.arrayBuffer()).toString('base64')}`
  }
  return entries
}

function parseMultipart(bytes: Uint8Array, contentType: string): Promise<FormData> {
  return new Response(bytes, { headers: { 'content-type': contentType } }).formData()
}

function phasesOf(events: UploadProgress[]): string[] {
  return events.map(({ phase }) => phase).filter((phase, index, phases) => phase !== phases[index - 1])
}

function isMonotonic(events: UploadProgress[]): boolean {
  return events.every((event, index) => index === 0 || event.sentBytes >= events[index - 1].sentBytes)
}

describe('upload progress', () => {
  let available: Set<string>
  let replies: EntitiesReply[]
  let calls: EntitiesCall[]
  let onChunk: () => void
  let fetcher: IFetchComponent
  let client: ContentClient
  let events: UploadProgress[]
  let onUploadProgress: (progress: UploadProgress) => void

  beforeEach(() => {
    available = new Set()
    replies = []
    calls = []
    events = []
    onChunk = () => {}
    onUploadProgress = (progress) => events.push(progress)
    fetcher = {
      fetch: jest.fn(async (url: string, init?: any) => {
        if (url.includes('/available-content')) {
          const cids = new globalThis.URL(url).searchParams.getAll('cid')
          return {
            ok: true,
            status: 200,
            json: async () => cids.map((cid) => ({ cid, available: available.has(cid) })),
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(0)
          }
        }
        const call: EntitiesCall = { url, init }
        calls.push(call)
        const reply = replies.shift()
        if (!reply) throw new Error('Unexpected extra POST /entities call')
        if (reply.error) throw reply.error
        if (init.body instanceof ReadableStream) {
          call.received = await readStream(init.body, reply, () => onChunk())
        } else if (reply.failAfterChunks !== undefined) {
          throw new Error('network failure')
        }
        return {
          ok: reply.status < 300,
          status: reply.status,
          headers: { get: () => null },
          json: async () => reply.body ?? {},
          text: async () => JSON.stringify(reply.body ?? {}),
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      })
    }
    client = createContentClient({ url: URL, fetcher })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('when deploying with an onUploadProgress callback', () => {
    let deployData: DeploymentData
    let expectedForm: Record<string, string>
    let receivedForm: Record<string, string>

    beforeEach(async () => {
      deployData = makeDeployData({ hashA: 1000, hashB: 600 * 1024 })
      available.add('hashA')
      replies = [{ status: 200, body: { creationTimestamp: 1 } }]
      await client.deploy(deployData, {
        onUploadProgress,
        headers: { 'x-custom': 'yes', 'Content-Type': 'text/plain' }
      })
      expectedForm = await describeForm(
        await client.buildEntityFormDataForDeployment({ ...deployData, files: new Map(deployData.files) })
      )
      receivedForm = await describeForm(await parseMultipart(calls[0].received!, calls[0].init.headers['content-type']))
    })

    it('should stream the exact multipart encoding of the deployment form', () => {
      expect(receivedForm).toEqual(expectedForm)
    })

    it('should send a content-length matching the streamed bytes', () => {
      expect(calls[0].init.headers['content-length']).toBe(String(calls[0].received!.byteLength))
    })

    it('should send the multipart content-type in place of the caller one and keep the other caller headers', () => {
      expect(calls[0].init.headers).toEqual({
        'x-custom': 'yes',
        'content-type': expect.stringMatching(/^multipart\/form-data; boundary=/),
        'content-length': expect.any(String)
      })
    })

    it('should send the stream with duplex half', () => {
      expect(calls[0].init.duplex).toBe('half')
    })

    it('should report the checking, uploading and processing phases in order', () => {
      expect(phasesOf(events)).toEqual(['checking', 'uploading', 'processing'])
    })

    it('should report monotonic sent bytes', () => {
      expect(isMonotonic(events)).toBe(true)
    })

    it('should end with every byte sent, excluding the files already on the server', () => {
      expect(events[events.length - 1]).toEqual({
        phase: 'processing',
        sentBytes: ENTITY_FILE.byteLength + 600 * 1024,
        totalBytes: ENTITY_FILE.byteLength + 600 * 1024
      })
    })

    it('should report the full count before the processing phase', () => {
      const firstProcessing = events.findIndex(({ phase }) => phase === 'processing')
      expect(events[firstProcessing - 1]).toEqual({
        phase: 'uploading',
        sentBytes: ENTITY_FILE.byteLength + 600 * 1024,
        totalBytes: ENTITY_FILE.byteLength + 600 * 1024
      })
    })
  })

  describe('when deploying without an onUploadProgress callback', () => {
    beforeEach(async () => {
      replies = [{ status: 200 }]
      await client.deploy(makeDeployData({ hashA: 1000 }))
    })

    it('should send the plain FormData body', () => {
      expect(calls[0].init.body).toBeInstanceOf(FormData)
    })

    it('should not add duplex or body headers', () => {
      expect(calls[0].init).toEqual({ method: 'POST', body: expect.any(FormData), headers: {} })
    })
  })

  describe('when deploying partially without an onUploadProgress callback', () => {
    beforeEach(async () => {
      replies = [{ status: 200, body: { creationTimestamp: 1 } }]
      await client.deployPartial(makeDeployData({ hashA: 1000 }))
    })

    it('should send the plain FormData body without duplex or body headers', () => {
      expect(calls[0].init).toEqual({
        method: 'POST',
        body: expect.any(FormData),
        headers: {},
        abortController: expect.any(AbortController),
        timeout: undefined,
        attempts: undefined,
        retryDelay: undefined
      })
    })
  })

  describe('when deploying partially across several batches with concurrency', () => {
    beforeEach(async () => {
      replies = [{ status: 202 }, { status: 202 }, { status: 202 }, { status: 200, body: { creationTimestamp: 1 } }]
      await client.deployPartial(makeDeployData({ hashA: 100, hashB: 100, hashC: 100, hashD: 100 }), {
        maxBatchSizeBytes: 100,
        concurrency: 2,
        onUploadProgress
      })
    })

    it('should stream every batch', () => {
      expect(calls.map(({ init }) => init.duplex)).toEqual(['half', 'half', 'half', 'half'])
    })

    it('should sum the bytes of every batch into the total', () => {
      expect(events[events.length - 1]).toEqual({ phase: 'processing', sentBytes: 403, totalBytes: 403 })
    })

    it('should report monotonic sent bytes', () => {
      expect(isMonotonic(events)).toBe(true)
    })
  })

  describe('when a 202 missing list makes a resume round re-send content', () => {
    beforeEach(async () => {
      replies = [
        { status: 202, body: { missing: ['hashB'] } },
        { status: 202, body: { missing: ['hashA'] } },
        { status: 200, body: { creationTimestamp: 1 } }
      ]
      await client.deployPartial(makeDeployData({ hashA: 100, hashB: 100 }), {
        maxBatchSizeBytes: 100,
        concurrency: 1,
        resumeDelay: 0,
        onUploadProgress
      })
    })

    it('should add the re-sent bytes to the total', () => {
      expect(events[events.length - 1]).toEqual({ phase: 'processing', sentBytes: 303, totalBytes: 303 })
    })

    it('should go back to uploading for each request of the resume round', () => {
      // Round 1 sends the entity batch, then hashB; round 2 re-sends hashA.
      expect(phasesOf(events)).toEqual([
        'checking',
        'uploading',
        'processing',
        'uploading',
        'processing',
        'uploading',
        'processing'
      ])
    })
  })

  describe('when a batch fails mid-stream and is retried', () => {
    const fileBytes = ENTITY_FILE.byteLength + 600 * 1024

    beforeEach(async () => {
      replies = [
        { status: 200, failAfterChunks: 1 },
        { status: 200, body: { creationTimestamp: 1 } }
      ]
      await client.deployPartial(makeDeployData({ hashA: 600 * 1024 }), { resumeDelay: 0, onUploadProgress })
    })

    it('should never decrease the sent bytes', () => {
      expect(isMonotonic(events)).toBe(true)
    })

    it('should never report more sent bytes than the total', () => {
      expect(events.every(({ sentBytes, totalBytes }) => sentBytes <= totalBytes)).toBe(true)
    })

    it('should grow the total by the bytes the failed attempt sent and end at 100%', () => {
      const last = events[events.length - 1]
      expect([last.totalBytes > fileBytes, last.totalBytes < 2 * fileBytes, last.sentBytes]).toEqual([
        true,
        true,
        last.totalBytes
      ])
    })
  })

  describe('when progress events come faster than the throttle interval', () => {
    let slices: number

    beforeEach(async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
      replies = [{ status: 200 }]
      await client.deploy(makeDeployData({ hashA: 16 * UPLOAD_SLICE_BYTES }), { onUploadProgress })
      slices = calls[0].received!.byteLength / UPLOAD_SLICE_BYTES
    })

    it('should emit far fewer events than slices', () => {
      expect([slices > 16, events.length]).toEqual([true, 4])
    })

    it('should still emit every phase change', () => {
      expect(phasesOf(events)).toEqual(['checking', 'uploading', 'processing'])
    })
  })

  describe('when progress events are spaced beyond the throttle interval', () => {
    beforeEach(async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
      onChunk = () => jest.advanceTimersByTime(uploadProgress.UPLOAD_PROGRESS_INTERVAL_MS)
      replies = [{ status: 200 }]
      await client.deploy(makeDeployData({ hashA: 4 * UPLOAD_SLICE_BYTES }), { onUploadProgress })
    })

    it('should emit one uploading event per slice', () => {
      expect(events.filter(({ phase }) => phase === 'uploading')).toHaveLength(5)
    })
  })

  describe('when the caller aborts a deploy mid-stream', () => {
    let controller: AbortController
    let error: unknown

    beforeEach(async () => {
      controller = new AbortController()
      onChunk = () => controller.abort()
      replies = [{ status: 200 }]
      error = await client
        .deploy(makeDeployData({ hashA: 4 * UPLOAD_SLICE_BYTES }), { signal: controller.signal, onUploadProgress })
        .catch((e) => e)
    })

    it('should reject with the abort error', () => {
      expect(error).toEqual(expect.objectContaining({ name: 'AbortError' }))
    })

    it('should stop the stream after the slice read before the abort', () => {
      expect(calls[0].received).toBeUndefined()
    })

    it('should not count more than the slice handed over before the abort', () => {
      expect(Math.max(...events.map(({ sentBytes }) => sentBytes))).toBeLessThanOrEqual(UPLOAD_SLICE_BYTES)
    })
  })

  describe('when the caller aborts a partial deploy mid-stream', () => {
    let controller: AbortController
    let error: unknown

    beforeEach(async () => {
      controller = new AbortController()
      onChunk = () => controller.abort()
      replies = [{ status: 200 }]
      error = await client
        .deployPartial(makeDeployData({ hashA: 4 * UPLOAD_SLICE_BYTES }), {
          signal: controller.signal,
          resumeDelay: 0,
          onUploadProgress
        })
        .catch((e) => e)
    })

    it('should reject without retrying', () => {
      expect([error, calls.length]).toEqual([expect.objectContaining({ name: 'AbortError' }), 1])
    })

    it('should stop the stream through the per-request abort controller', () => {
      expect([calls[0].init.abortController.signal.aborted, calls[0].received]).toEqual([true, undefined])
    })
  })

  describe('when the fetcher drops the duplex option', () => {
    let deployData: DeploymentData

    beforeEach(async () => {
      deployData = makeDeployData({ hashA: 1000 })
      replies = [
        { status: 200, error: new TypeError('RequestInit: duplex option is required when sending a body.') },
        { status: 200 },
        { status: 200 }
      ]
      await client.deploy(deployData, { onUploadProgress })
      await client.deploy(deployData, { onUploadProgress })
    })

    it('should resend the request with the plain FormData', () => {
      expect(calls[1].init.body).toBeInstanceOf(FormData)
    })

    it('should send the plain FormData from then on', () => {
      expect(calls[2].init.body).toBeInstanceOf(FormData)
    })

    it('should report the bytes as sent once the response arrives', () => {
      expect(events[events.length - 1]).toEqual({ phase: 'processing', sentBytes: 1003, totalBytes: 1003 })
    })
  })

  describe('when the fetcher rejects with another TypeError', () => {
    let error: unknown

    beforeEach(async () => {
      replies = [{ status: 200, error: new TypeError('fetch failed') }]
      error = await client.deploy(makeDeployData({ hashA: 1000 }), { onUploadProgress }).catch((e) => e)
    })

    it('should propagate the error without resending', () => {
      expect([(error as Error).message, calls.length]).toEqual(['fetch failed', 1])
    })
  })

  describe('when request bodies cannot be streamed', () => {
    beforeEach(async () => {
      jest.spyOn(uploadProgress, 'supportsStreamingUpload').mockReturnValue(false)
      client = createContentClient({ url: URL, fetcher })
      replies = [{ status: 200 }]
      await client.deploy(makeDeployData({ hashA: 1000 }), { onUploadProgress })
    })

    it('should send the plain FormData', () => {
      expect(calls[0].init.body).toBeInstanceOf(FormData)
    })

    it('should report processing while waiting and count the bytes when the response arrives', () => {
      expect(events).toEqual([
        { phase: 'checking', sentBytes: 0, totalBytes: 1003 },
        { phase: 'processing', sentBytes: 0, totalBytes: 1003 },
        { phase: 'processing', sentBytes: 1003, totalBytes: 1003 }
      ])
    })
  })

  describe('when deploying through the default fetcher to a real server', () => {
    let server: Server
    let received: { headers: IncomingHttpHeaders; body: Buffer }
    let deployData: DeploymentData
    let receivedForm: Record<string, string>
    let expectedForm: Record<string, string>

    beforeEach(async () => {
      server = createServer((req, res) => {
        if (req.url?.startsWith('/available-content')) {
          res.setHeader('content-type', 'application/json')
          res.end('[]')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          received = { headers: req.headers, body: Buffer.concat(chunks) }
          res.setHeader('content-type', 'application/json')
          res.end('{"creationTimestamp":1}')
        })
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const { port } = server.address() as AddressInfo
      client = createContentClient({ url: `http://127.0.0.1:${port}`, fetcher: createFetchComponent() })
      deployData = makeDeployData({ hashA: 3 * UPLOAD_SLICE_BYTES })
      await client.deploy(deployData, { onUploadProgress })
      receivedForm = await describeForm(
        await parseMultipart(new Uint8Array(received.body), received.headers['content-type']!)
      )
      expectedForm = await describeForm(await client.buildEntityFormDataForDeployment(deployData))
    })

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve))
    })

    it('should receive the exact content-length', () => {
      expect(received.headers['content-length']).toBe(String(received.body.byteLength))
    })

    it('should not receive a chunked transfer-encoding', () => {
      expect(received.headers['transfer-encoding']).toBeUndefined()
    })

    it('should receive the full body', () => {
      expect(receivedForm).toEqual(expectedForm)
    })

    it('should report every byte as sent', () => {
      expect(events[events.length - 1]).toEqual({
        phase: 'processing',
        sentBytes: 3 + 3 * UPLOAD_SLICE_BYTES,
        totalBytes: 3 + 3 * UPLOAD_SLICE_BYTES
      })
    })
  })
})
