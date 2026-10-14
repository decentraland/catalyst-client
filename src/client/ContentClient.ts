import { hashV0, hashV1 } from '@dcl/hashing'
import { Entity } from '@dcl/schemas'
import {
  ClientOptions,
  DeploymentData,
  FetchResponse,
  IFetchComponent,
  ParallelConfig,
  PartialDeploymentOptions,
  PartialDeploymentResult,
  RequestOptions,
  UploadProgress,
  UploadProgressOptions
} from './types'
import { addModelToFormData, mergeRequestOptions, sanitizeUrl, splitAndFetch } from './utils/Helper'
import { DEFAULT_MAX_BATCH_SIZE_BYTES, splitIntoBatches } from './utils/batching'
import {
  DeploymentError,
  PartialDeploymentNotSupportedError,
  PartialDeploymentRetryLaterError,
  PartialDeploymentValidationError,
  RetryablePartialDeploymentError
} from './utils/errors'
import { retry } from './utils/retry'
import {
  createCountingBody,
  createUploadProgressTracker,
  isDuplexUnsupportedError,
  supportsStreamingUpload,
  trackUpload,
  UploadProgressTracker,
  withBodyHeaders
} from './utils/upload-progress'

// Resolves after `ms`, or early once `signal` aborts.
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

// The default @dcl/fetch-component honors `abortController` but overwrites `signal`, so requests get
// a per-request controller linked to `signal`. Call `dispose` once the request settles.
function linkAbortController(signal?: AbortSignal): { abortController: AbortController; dispose: () => void } {
  const abortController = new AbortController()
  const onAbort = () => abortController.abort()
  if (signal?.aborted) abortController.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  return { abortController, dispose: () => signal?.removeEventListener('abort', onAbort) }
}

function assertOption(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`options.${name} must be an integer >= ${min}, got ${value}.`)
  }
}

function abortedByCaller(): Error {
  return new Error('The partial deployment was aborted by the caller.')
}

// Ceiling for the exponential resume backoff, so a caller-tuned maxResumeAttempts can't grow
// 2^attempt into effectively-hung multi-hour sleeps.
const MAX_RESUME_BACKOFF_MS = 60_000

// Retryable per ADR-325 besides 5xx: processing deadline, replacement conflict, throttling.
const RETRYABLE_STATUSES = new Set([408, 409, 429])

// Combines several abort signals into one that aborts as soon as any of them does. Used so a request
// honors both the caller's cancellation signal and deployPartial's internal first-200-wins controller.
// (Hand-rolled rather than AbortSignal.any, which is only available on Node >= 20.3.)
//
// `dispose` detaches the listeners from the source signals. Call it when the combined signal is no
// longer needed: sources like a caller-provided signal can outlive many sessions, and undisposed
// listeners would accumulate on them (Node warns past ~10 listeners on one signal).
function combineSignals(signals: Array<AbortSignal | undefined>): {
  signal: AbortSignal | undefined
  dispose: () => void
} {
  const present = signals.filter((signal): signal is AbortSignal => !!signal)
  if (present.length <= 1) {
    return { signal: present[0], dispose: () => {} }
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of present) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const signal of present) {
        signal.removeEventListener('abort', abort)
      }
    }
  }
}

// Parse an HTTP `Retry-After` value (delta-seconds, or an HTTP date) into milliseconds. Returns
// undefined when absent or unparseable, so the caller falls back to its exponential backoff.
function parseRetryAfterMs(headerValue: string | undefined): number | undefined {
  if (!headerValue) {
    return undefined
  }
  const seconds = Number(headerValue)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const dateMs = Date.parse(headerValue)
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }
  return undefined
}

export type AvailableContentResult = {
  cid: string
  available: boolean
}[]

export type ContentClient = {
  buildEntityFormDataForDeployment(deployData: DeploymentData, options?: RequestOptions): Promise<FormData>

  /** Retrieve / Download */
  fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntitiesByIds(ids: string[], options?: RequestOptions & { parallel?: ParallelConfig }): Promise<Entity[]>
  fetchEntityById(id: string, options?: RequestOptions & { parallel?: ParallelConfig }): Promise<Entity>
  downloadContent(contentHash: string, options?: RequestOptions & { avoidChecks?: boolean }): Promise<Uint8Array>

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult>

  /**
   * Deploys an entity to the content server.
   */
  deploy(deployData: DeploymentData, options?: RequestOptions & UploadProgressOptions): Promise<unknown>

  /**
   * Deploys an entity across multiple requests (partial deployment, ADR-325): content files are split into
   * size-bounded batches and uploaded in several `POST /entities` requests, and the entity only becomes
   * live once the server has all of it. Useful for scenes too large for a single request. The server
   * must support the partial-deployment protocol; against one that doesn't, if everything fits in a
   * single batch this still succeeds, otherwise it rejects with {@link PartialDeploymentNotSupportedError}.
   */
  deployPartial(
    deployData: DeploymentData,
    options?: RequestOptions & PartialDeploymentOptions
  ): Promise<PartialDeploymentResult>

  /**
   * Checks if a pointer is consistent across multiple content servers
   */
  checkPointerConsistency(
    pointer: string,
    options?: RequestOptions & { parallel?: ParallelConfig }
  ): Promise<{
    isConsistent: boolean
    upToDateEntities?: Entity[]
    outdatedEntities?: Entity[]
  }>
}

export async function downloadContent(
  fetcher: IFetchComponent,
  baseUrl: string,
  contentHash: string,
  options?: Partial<RequestOptions> & { avoidChecks?: boolean }
): Promise<Uint8Array> {
  const { attempts = 3, retryDelay = 500 } = options ? options : {}
  const timeout = options?.timeout ? { timeout: options.timeout } : {}

  return retry(
    `fetch file with hash ${contentHash} from ${baseUrl}`,
    async () => {
      const response = await fetcher.fetch(`${baseUrl}/${contentHash}`, timeout)
      const content = new Uint8Array(await response.arrayBuffer())
      if (!options?.avoidChecks) {
        const downloadedHash = contentHash.startsWith('Qm') ? await hashV0(content) : await hashV1(content)

        // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
        // So we will check the hash before considering the download successful.
        if (downloadedHash !== contentHash) {
          throw new Error(`Failed to fetch file with hash ${contentHash} from ${baseUrl}`)
        }
      }
      return content
    },
    attempts,
    retryDelay
  )
}

export function createContentClient(options: ClientOptions): ContentClient {
  const { fetcher, logger } = options

  // A throwing progress callback must not fail a deployment or, from the throttle timer, crash the process.
  function guardProgress(onUploadProgress: (progress: UploadProgress) => void): (progress: UploadProgress) => void {
    return (progress) => {
      try {
        onUploadProgress(progress)
      } catch (error) {
        logger?.warn('The onUploadProgress callback threw:', error)
      }
    }
  }
  const contentUrl = sanitizeUrl(options.url)
  const defaultParallelConfig = options?.parallelConfig
  // Off once the fetcher rejects a streamed body, so later uploads send the plain form.
  let streamingUploads = !!options.streamingUploads && supportsStreamingUpload()

  async function fetchFromMultipleServersRace(
    urls: string[],
    path: string,
    requestOptions: RequestOptions
  ): Promise<Entity[]> {
    const controller = new AbortController()
    const signal = controller.signal

    const requestOptionsWithSignal = mergeRequestOptions(requestOptions, { signal })

    return new Promise<Entity[]>(async (resolve) => {
      let pendingRequests = urls.length

      const markRequestAsComplete = () => {
        pendingRequests--
        if (pendingRequests === 0) {
          resolve([])
        }
      }

      const handleSuccess = (entities: Entity[]) => {
        if (entities && Array.isArray(entities) && entities.length > 0) {
          controller.abort()
          resolve(entities)
          return true
        }
        return false
      }

      urls.forEach(async (url) => {
        try {
          const serverUrl = sanitizeUrl(url)
          const response = await fetcher.fetch(`${serverUrl}${path}`, requestOptionsWithSignal)

          if (signal.aborted) {
            markRequestAsComplete()
            return
          }

          const entities = await response.json()

          if (!handleSuccess(entities)) {
            markRequestAsComplete()
          }
        } catch (error) {
          if (!signal.aborted) {
            logger?.warn(`Failed to fetch from ${url}:`, error)
          }
          markRequestAsComplete()
        }
      })
    })
  }

  async function fetchFromMultipleServersAllWithResults(
    urls: string[],
    path: string,
    requestOptions: RequestOptions
  ): Promise<{ entities: Entity[]; emptyResults: number }> {
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const serverUrl = sanitizeUrl(url)
          const response = await fetcher.fetch(`${serverUrl}${path}`, requestOptions)
          return await response.json()
        } catch (error) {
          logger?.warn(`Failed to fetch from ${url}:`, error)
          return []
        }
      })
    )

    const serverResults = results
      .filter((result): result is PromiseFulfilledResult<Entity[]> => result.status === 'fulfilled')
      .map((result) => result.value || [])

    const allEntities = serverResults.flatMap((entities) => entities)
    const emptyResults = serverResults.filter((entities) => entities.length === 0).length

    const uniqueEntities = new Map<string, Entity>()
    allEntities.forEach((entity) => {
      if (!uniqueEntities.has(entity.id) || entity.timestamp > uniqueEntities.get(entity.id)!.timestamp) {
        uniqueEntities.set(entity.id, entity)
      }
    })

    return {
      entities: Array.from(uniqueEntities.values()),
      emptyResults
    }
  }

  // Builds the multipart body shared by full and partial deployments. Appends the fixed fields
  // (entityId, the `partial` flag when set, and the auth chain) BEFORE any file part, so streaming
  // multipart parsers see them early, then appends one file part per hash in `fileHashes`.
  function buildDeploymentForm(deployData: DeploymentData, fileHashes: Iterable<string>, partial: boolean): FormData {
    // Use the web-standard FormData/Blob (global in browsers and Node >= 18). When this form is
    // used as a request body, native fetch (and node-fetch v3) set the multipart Content-Type with
    // the boundary automatically, so the deployment works without a node-fetch-specific fetcher.
    const form = new FormData()
    form.append('entityId', deployData.entityId)
    if (partial) {
      form.append('partial', 'true')
    }
    addModelToFormData(deployData.authChain, form, 'authChain')

    for (const fileHash of fileHashes) {
      const file = deployData.files.get(fileHash)
      if (file) {
        // Blob copies the bytes; TS 5.7+ types only accept ArrayBuffer-backed views here
        form.append(fileHash, new Blob([file as Uint8Array<ArrayBuffer>]), fileHash)
      }
    }

    return form
  }

  async function hashesToDeploy(deployData: DeploymentData, options?: RequestOptions): Promise<string[]> {
    const alreadyUploadedHashes = await hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    return Array.from(deployData.files.keys()).filter(
      (fileHash) => !alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId
    )
  }

  async function buildEntityFormDataForDeployment(
    deployData: DeploymentData,
    options?: RequestOptions
  ): Promise<FormData> {
    return buildDeploymentForm(deployData, await hashesToDeploy(deployData, options), false)
  }

  function fileBytesOf(deployData: DeploymentData, hashes: Iterable<string>): number {
    let total = 0
    for (const hash of hashes) total += deployData.files.get(hash)?.byteLength ?? 0
    return total
  }

  // POSTs a deployment form. With an upload tracker, the body is streamed and counted where possible.
  async function postDeploymentForm(
    url: string,
    form: FormData,
    requestOptions: RequestOptions,
    upload?: { tracker: UploadProgressTracker; fileBytes: number; signal?: AbortSignal }
  ): Promise<FetchResponse> {
    const plainOptions = mergeRequestOptions(requestOptions, { body: form as any, method: 'POST' })
    if (!upload) {
      return fetcher.fetch(url, plainOptions)
    }
    const progress = upload.tracker.request(upload.fileBytes, streamingUploads)
    try {
      if (streamingUploads) {
        const counting = await createCountingBody(url, form, progress.streamed, upload.signal)
        try {
          return await fetcher.fetch(url, {
            ...requestOptions,
            headers: withBodyHeaders(requestOptions.headers, counting.headers),
            body: counting.body,
            method: 'POST',
            duplex: 'half'
          } as RequestOptions)
        } catch (error) {
          // A fetcher that drops `duplex` makes Node reject the stream before sending anything.
          if (!isDuplexUnsupportedError(error)) throw error
          streamingUploads = false
          progress.unstreamed()
        } finally {
          counting.dispose()
        }
      }
      const response = await fetcher.fetch(url, plainOptions)
      progress.delivered()
      return response
    } finally {
      progress.end()
    }
  }

  async function deploy(
    deployData: DeploymentData,
    options?: RequestOptions & UploadProgressOptions
  ): Promise<unknown> {
    const { onUploadProgress, ...requestOptions } = options ?? {}
    if (!onUploadProgress) {
      const form = buildDeploymentForm(deployData, await hashesToDeploy(deployData, requestOptions), false)
      return postDeploymentForm(`${contentUrl}/entities`, form, requestOptions)
    }

    const tracker = createUploadProgressTracker(guardProgress(onUploadProgress))
    return trackUpload(
      tracker,
      async () => {
        tracker.checking(fileBytesOf(deployData, deployData.files.keys()))
        const fileHashes = await hashesToDeploy(deployData, requestOptions)
        const form = buildDeploymentForm(deployData, fileHashes, false)
        const fileBytes = fileBytesOf(deployData, fileHashes)
        tracker.plan(fileBytes)
        const signal = requestOptions.signal ?? requestOptions.abortController?.signal
        return postDeploymentForm(`${contentUrl}/entities`, form, requestOptions, { tracker, fileBytes, signal })
      },
      // An error response (e.g. an early 413) resolves too, but must not report the upload as complete.
      (response) => (response as { ok?: boolean } | undefined)?.ok !== false
    )
  }

  async function deployPartial(
    deployData: DeploymentData,
    options?: RequestOptions & PartialDeploymentOptions
  ): Promise<PartialDeploymentResult> {
    const tracker = options?.onUploadProgress && createUploadProgressTracker(guardProgress(options.onUploadProgress))
    return trackUpload(tracker, () => uploadPartial(deployData, options, tracker))
  }

  async function uploadPartial(
    deployData: DeploymentData,
    options: (RequestOptions & PartialDeploymentOptions) | undefined,
    tracker: UploadProgressTracker | undefined
  ): Promise<PartialDeploymentResult> {
    const maxBatchSizeBytes = options?.maxBatchSizeBytes ?? DEFAULT_MAX_BATCH_SIZE_BYTES
    const concurrency = options?.concurrency ?? 2
    const maxResumeAttempts = options?.maxResumeAttempts ?? 3
    const resumeDelay = options?.resumeDelay ?? 1000
    const onProgress = options?.onProgress
    assertOption('maxBatchSizeBytes', maxBatchSizeBytes, 1)
    assertOption('concurrency', concurrency, 1)
    assertOption('maxResumeAttempts', maxResumeAttempts, 0)
    if (!Number.isFinite(resumeDelay) || resumeDelay < 0) {
      throw new RangeError(`options.resumeDelay must be a finite number >= 0, got ${resumeDelay}.`)
    }

    const entityId = deployData.entityId
    const allContentHashes = Array.from(deployData.files.keys()).filter((hash) => hash !== entityId)
    const sizeOf = (hash: string) => deployData.files.get(hash)?.byteLength ?? 0
    const totalBytes = allContentHashes.reduce((acc, hash) => acc + sizeOf(hash), 0)

    // Request options without the partial-specific keys or the abort signal (combined per round).
    const requestBase: RequestOptions = {
      headers: options?.headers,
      timeout: options?.timeout,
      attempts: options?.attempts,
      retryDelay: options?.retryDelay
    }
    // The caller's cancellation signal, honored on every request of every session.
    const callerSignal = options?.signal ?? options?.abortController?.signal

    // A server that predates partial deployments runs the staging request through the full deploy
    // pipeline and rejects the missing content. Match either server's phrasing: worlds-content-server
    // says "neither present in the storage...", and catalyst (via @dcl/content-validator) says
    // "referenced in the entity but was not uploaded or previously available".
    const notSupportedPattern = /neither present in the storage|was not uploaded or previously available/i
    const classify4xx = (status: number, body: string): DeploymentError => {
      if (notSupportedPattern.test(body)) {
        return new PartialDeploymentNotSupportedError(
          `The server does not support partial deployments (it validated a staging request as a full deployment). ` +
            `Use deploy() for this server. Server response: ${body}`,
          status,
          body
        )
      }
      return new PartialDeploymentValidationError(`The partial deployment was rejected: ${body}`, status, body)
    }

    type BatchOutcome = { kind: 'deployed'; result: PartialDeploymentResult } | { kind: 'incomplete' }

    // Upload state shared across rounds. The latest 202 `missing` list is authoritative (ADR-325).
    let entityStaged = false
    let latestMissing: string[] | undefined
    let missingUpdatedThisRound = false
    let uploadedBytes = 0
    let completedBatches = 0
    let totalBatches = 1
    const bytesOf = (hashes: Iterable<string>) => fileBytesOf(deployData, hashes)
    const reportProgress = () => {
      try {
        onProgress?.({ uploadedBytes, totalBytes, completedBatches, totalBatches })
      } catch (error) {
        // A faulty progress callback must not break the deployment.
        logger?.warn('The partial deployment onProgress callback threw:', error)
      }
    }

    // Sends one request. Throws a terminal DeploymentError for a non-retryable 4xx, and a
    // RetryablePartialDeploymentError for 408, 409, 429 and 5xx; network errors propagate as-is.
    const sendRequest = async (fileHashes: string[], signal?: AbortSignal): Promise<BatchOutcome> => {
      const form = buildDeploymentForm(deployData, fileHashes, true)
      const { abortController, dispose } = linkAbortController(signal)
      try {
        const requestOptions = mergeRequestOptions(requestBase, { abortController })
        const upload = tracker && { tracker, fileBytes: bytesOf(fileHashes), signal: abortController.signal }
        // The query flag lets the server tell a batch from a regular deployment before reading the body.
        const response = await postDeploymentForm(`${contentUrl}/entities?partial=true`, form, requestOptions, upload)
        if (response.status === 200) {
          // The server published: an unreadable or aborted body read still means success.
          let result: PartialDeploymentResult
          try {
            result = (await response.json()) as PartialDeploymentResult
          } catch {
            result = { creationTimestamp: Date.now() }
          }
          return { kind: 'deployed', result }
        }
        if (response.status === 202) {
          if (fileHashes.includes(entityId)) {
            entityStaged = true
          }
          let missing: string[] | undefined
          try {
            const parsed = ((await response.json()) as { missing?: unknown })?.missing
            missing = Array.isArray(parsed)
              ? parsed.filter((hash): hash is string => typeof hash === 'string')
              : undefined
          } catch {
            // No diagnosis available; the round falls back to re-sending what it sent.
          }
          if (missing) {
            // A hash the caller never provided can never be uploaded.
            const undeliverable = missing.filter((hash) => !deployData.files.has(hash))
            if (undeliverable.length > 0) {
              throw new PartialDeploymentValidationError(
                `The server is still missing content the deployment does not include: ${undeliverable.join(
                  ', '
                )}. These hashes are referenced by the entity but absent from the provided files.`
              )
            }
            latestMissing = missing
            missingUpdatedThisRound = true
            uploadedBytes = Math.max(uploadedBytes, totalBytes - bytesOf(missing))
          } else {
            uploadedBytes = Math.min(
              totalBytes,
              uploadedBytes + bytesOf(fileHashes.filter((hash) => hash !== entityId))
            )
          }
          completedBatches++
          reportProgress()
          return { kind: 'incomplete' }
        }
        const body = await response.text().catch(() => '')
        if (RETRYABLE_STATUSES.has(response.status) || response.status >= 500) {
          const retryAfterMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? undefined)
          throw new RetryablePartialDeploymentError(
            `Server responded with status ${response.status}: ${body}`,
            retryAfterMs,
            response.status,
            body
          )
        }
        throw classify4xx(response.status, body)
      } finally {
        dispose()
      }
    }

    // Files are never split, so a file above the request cap can't be delivered.
    const assertDeliverable = (hashes: string[]) => {
      for (const hash of hashes) {
        const size = sizeOf(hash)
        if (size > maxBatchSizeBytes) {
          throw new PartialDeploymentValidationError(
            `The file '${hash}' (${size} bytes) exceeds the maximum request size of ` +
              `${maxBatchSizeBytes} bytes and files cannot be split across requests. If your infrastructure ` +
              `allows larger requests, raise options.maxBatchSizeBytes.`
          )
        }
      }
    }

    // Uploads `hashes` once: the entity file rides the first request until the server has staged it, then
    // the rest go through a bounded worker pool. First 200 wins; a terminal error aborts the rest.
    const runRound = async (hashes: string[]): Promise<BatchOutcome> => {
      if (callerSignal?.aborted) {
        throw abortedByCaller()
      }
      missingUpdatedThisRound = false
      const files = new Map<string, Uint8Array>()
      for (const hash of hashes) files.set(hash, deployData.files.get(hash)!)
      const batches = splitIntoBatches(files, maxBatchSizeBytes)
      totalBatches = Math.max(1, completedBatches + batches.length)

      let remaining = batches
      if (!entityStaged) {
        const first = await sendRequest([entityId, ...(batches[0]?.hashes ?? [])], callerSignal)
        if (first.kind === 'deployed') {
          return first
        }
        remaining = batches.slice(1)
      } else if (batches.length === 0) {
        // Nothing left to send but not published yet: an empty batch lets the server re-check and publish.
        remaining = [{ hashes: [], sizeBytes: 0 }]
        totalBatches = completedBatches + 1
      }

      const controller = new AbortController()
      // Combined once per round and disposed after the pool drains, so a long-lived caller signal doesn't
      // accumulate listeners.
      const { signal: roundSignal, dispose: disposeRoundSignal } = combineSignals([callerSignal, controller.signal])
      let deployed: PartialDeploymentResult | undefined
      let terminalError: DeploymentError | undefined
      let nextIndex = 0

      const worker = async (): Promise<void> => {
        while (!deployed && !terminalError) {
          const index = nextIndex++
          if (index >= remaining.length) {
            return
          }
          try {
            const outcome = await sendRequest(remaining[index].hashes, roundSignal)
            if (outcome.kind === 'deployed') {
              // The first 200 wins; a sibling's body read cut short by the abort keeps it.
              deployed ??= outcome.result
              controller.abort()
              return
            }
          } catch (error) {
            if (error instanceof DeploymentError) {
              terminalError = error
              controller.abort()
              return
            }
            // A sibling won or the round was aborted: this request was cancelled on purpose.
            if (deployed || controller.signal.aborted) {
              return
            }
            throw error
          }
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, Math.max(1, remaining.length)) }, () => worker())
      let roundError: unknown
      try {
        await Promise.all(workers)
      } catch (error) {
        // Captured so a concurrent win still takes precedence over a sibling's retryable failure.
        roundError = error
      } finally {
        // Cancel in-flight siblings and let them unwind before the next round starts.
        controller.abort()
        await Promise.allSettled(workers)
        disposeRoundSignal()
      }

      if (deployed) {
        return { kind: 'deployed', result: deployed }
      }
      if (terminalError) {
        throw terminalError
      }
      if (roundError) {
        throw roundError
      }
      return { kind: 'incomplete' }
    }

    if (callerSignal?.aborted) {
      throw abortedByCaller()
    }
    // /available-content only plans the first round; afterwards the server's `missing` list drives uploads.
    if (allContentHashes.length > 0) tracker?.checking(bytesOf(deployData.files.keys()))
    let alreadyOnServer = new Set<string>()
    if (allContentHashes.length > 0) {
      const { abortController, dispose } = linkAbortController(callerSignal)
      try {
        alreadyOnServer = await hashesAlreadyOnServer(allContentHashes, { ...requestBase, abortController })
      } catch (error) {
        throw callerSignal?.aborted ? abortedByCaller() : error
      } finally {
        dispose()
      }
      if (callerSignal?.aborted) {
        throw abortedByCaller()
      }
    }
    let toSend = allContentHashes.filter((hash) => !alreadyOnServer.has(hash))
    uploadedBytes = totalBytes - bytesOf(toSend)

    let failures = 0
    let stalledRounds = 0
    let lastError: unknown
    // Progress means a new low in the server's missing count, so an oscillating list can't loop forever.
    let fewestMissing = toSend.length
    const madeProgress = (): boolean => {
      if (!missingUpdatedThisRound || !latestMissing || latestMissing.length >= fewestMissing) {
        return false
      }
      fewestMissing = latestMissing.length
      failures = 0
      stalledRounds = 0
      return true
    }
    for (;;) {
      try {
        assertDeliverable(toSend)
        // Every round adds what it sends, so re-sent content grows the upload total.
        tracker?.plan(bytesOf(toSend) + (entityStaged ? 0 : sizeOf(entityId)))
        const outcome = await runRound(toSend)
        if (outcome.kind === 'deployed') {
          // The publishing 200 carries no progress of its own, and siblings it cancelled were no longer needed.
          totalBatches = Math.max(totalBatches, completedBatches + 1)
          completedBatches = totalBatches
          uploadedBytes = totalBytes
          reportProgress()
          return outcome.result
        }
        const next = missingUpdatedThisRound && latestMissing ? latestMissing : toSend
        if (!madeProgress()) {
          stalledRounds++
        }
        if (stalledRounds > maxResumeAttempts) {
          throw new DeploymentError(
            `The partial deployment did not finalize: the server still reports ${next.length} missing file(s) after ` +
              `${stalledRounds} round(s) without progress.`
          )
        }
        toSend = next
      } catch (error) {
        if (error instanceof DeploymentError) {
          throw error
        }
        // A caller abort takes effect as a failed request; surface it instead of retrying.
        if (callerSignal?.aborted) {
          throw error
        }
        lastError = error
        // Batches staged before the failure count as progress and refill the retry budget.
        madeProgress()
        if (failures >= maxResumeAttempts) {
          break
        }
        // Exponential backoff with a Retry-After floor, capped but never below the caller's resumeDelay.
        const retryAfterMs = error instanceof RetryablePartialDeploymentError ? error.retryAfterMs ?? 0 : 0
        const maxBackoffMs = Math.max(resumeDelay, MAX_RESUME_BACKOFF_MS)
        // Retrying before Retry-After can't succeed, so a longer wait ends the call with the server's reason.
        if (retryAfterMs > maxBackoffMs) {
          throw new PartialDeploymentRetryLaterError(
            `${error instanceof Error ? error.message : String(error)} Retry in ${Math.ceil(retryAfterMs / 1000)} s.`,
            retryAfterMs,
            (error as RetryablePartialDeploymentError).status,
            (error as RetryablePartialDeploymentError).responseBody
          )
        }
        const backoff = Math.min(Math.max(resumeDelay * 2 ** failures, retryAfterMs), maxBackoffMs)
        failures++
        await delay(backoff, callerSignal)
        if (callerSignal?.aborted) {
          throw abortedByCaller()
        }
        if (latestMissing) {
          toSend = latestMissing
        }
      }
    }

    const lastRetryable = lastError instanceof RetryablePartialDeploymentError ? lastError : undefined
    throw new DeploymentError(
      `The partial deployment failed after ${failures + 1} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      lastRetryable?.status,
      lastRetryable?.responseBody
    )
  }

  async function fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]> {
    if (pointers.length === 0) {
      return Promise.reject(`You must set at least one pointer.`)
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ pointers }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    return (await fetcher.fetch(`${contentUrl}/entities/active`, requestOptions)).json()
  }

  async function fetchEntitiesByIds(
    ids: string[],
    options?: RequestOptions & { parallel?: ParallelConfig }
  ): Promise<Entity[]> {
    if (ids.length === 0) {
      return Promise.reject(`You must set at least one id.`)
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ ids }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const parallelConfig = options?.parallel || defaultParallelConfig
    if (parallelConfig?.urls && parallelConfig?.urls.length > 0) {
      return fetchFromMultipleServersRace([contentUrl, ...parallelConfig.urls], '/entities/active', requestOptions)
    }

    return (await fetcher.fetch(`${contentUrl}/entities/active`, requestOptions)).json()
  }

  async function fetchEntityById(
    id: string,
    options?: RequestOptions & { parallel?: ParallelConfig }
  ): Promise<Entity> {
    const entities: Entity[] = await fetchEntitiesByIds([id], options)
    if (entities.length === 0) {
      return Promise.reject(`Failed to find an entity with id '${id}'.`)
    }
    return entities[0]
  }

  function isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
    if (cids.length === 0) {
      return Promise.reject(`You must set at least one cid.`)
    }

    return splitAndFetch<{ cid: string; available: boolean }>({
      fetcher: fetcher,
      options,
      baseUrl: contentUrl,
      path: `/available-content`,
      queryParams: { name: 'cid', values: cids },
      uniqueBy: 'cid'
    })
  }

  // Given an array of file hashes, return a set with those already uploaded on the server
  async function hashesAlreadyOnServer(hashes: string[], options?: RequestOptions): Promise<Set<string>> {
    const result: AvailableContentResult = await isContentAvailable(hashes, options)

    const alreadyUploaded = result.filter(($) => $.available).map(({ cid }) => cid)

    return new Set(alreadyUploaded)
  }

  async function checkPointerConsistency(
    pointer: string,
    options?: RequestOptions & { parallel?: ParallelConfig }
  ): Promise<{
    isConsistent: boolean
    upToDateEntities?: Entity[]
    outdatedEntities?: Entity[]
  }> {
    const parallelConfig = options?.parallel || defaultParallelConfig
    if (!parallelConfig?.urls || parallelConfig.urls.length === 0) {
      throw new Error('Parallel configuration is required for checking pointer consistency')
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ pointers: [pointer] }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const allUrls = [contentUrl, ...parallelConfig.urls]
    const { entities, emptyResults } = await fetchFromMultipleServersAllWithResults(
      allUrls,
      '/entities/active',
      requestOptions
    )

    if (entities.length === 0) {
      return {
        isConsistent: true,
        upToDateEntities: undefined,
        outdatedEntities: undefined
      }
    }

    const newestTimestamp = Math.max(...entities.map((e) => e.timestamp))

    const newerEntities = entities.filter((e) => e.timestamp === newestTimestamp)
    const olderEntities = entities.filter((e) => e.timestamp < newestTimestamp)

    const isConsistent = olderEntities.length === 0 && emptyResults === 0

    return {
      isConsistent,
      upToDateEntities: newerEntities.length > 0 ? newerEntities : undefined,
      outdatedEntities: olderEntities.length > 0 ? olderEntities : undefined
    }
  }

  return {
    buildEntityFormDataForDeployment,
    fetchEntitiesByPointers,
    fetchEntitiesByIds,
    fetchEntityById,
    downloadContent: (contentHash: string, options?: Partial<RequestOptions>) => {
      return downloadContent(fetcher, contentUrl + '/contents', contentHash, options)
    },
    deploy,
    deployPartial,
    isContentAvailable,
    checkPointerConsistency
  }
}
