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
  RequestOptions
} from './types'
import { addModelToFormData, mergeRequestOptions, sanitizeUrl, splitAndFetch } from './utils/Helper'
import { DEFAULT_MAX_BATCH_SIZE_BYTES, splitIntoBatches } from './utils/batching'
import { DeploymentError, PartialDeploymentNotSupportedError, PartialDeploymentValidationError } from './utils/errors'
import { retry } from './utils/retry'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Ceiling for the exponential resume backoff, so a caller-tuned maxResumeAttempts can't grow
// 2^attempt into effectively-hung multi-hour sleeps.
const MAX_RESUME_BACKOFF_MS = 60_000

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
  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown>

  /**
   * Deploys an entity across multiple requests (partial deployment): content files are split into
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
  const contentUrl = sanitizeUrl(options.url)
  const defaultParallelConfig = options?.parallelConfig

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
        form.append(fileHash, new Blob([file]), fileHash)
      }
    }

    return form
  }

  async function buildEntityFormDataForDeployment(
    deployData: DeploymentData,
    options?: RequestOptions
  ): Promise<FormData> {
    const alreadyUploadedHashes = await hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    const fileHashes = Array.from(deployData.files.keys()).filter(
      (fileHash) => !alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId
    )
    return buildDeploymentForm(deployData, fileHashes, false)
  }

  async function deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    const form = await buildEntityFormDataForDeployment(deployData, options)

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: form as any,
      method: 'POST'
    })

    return await fetcher.fetch(`${contentUrl}/entities`, requestOptions)
  }

  async function deployPartial(
    deployData: DeploymentData,
    options?: RequestOptions & PartialDeploymentOptions
  ): Promise<PartialDeploymentResult> {
    const maxBatchSizeBytes = options?.maxBatchSizeBytes ?? DEFAULT_MAX_BATCH_SIZE_BYTES
    const concurrency = Math.max(1, options?.concurrency ?? 2)
    const maxResumeAttempts = options?.maxResumeAttempts ?? 3
    const resumeDelay = options?.resumeDelay ?? 1000
    const onProgress = options?.onProgress

    const entityId = deployData.entityId
    const allContentHashes = Array.from(deployData.files.keys()).filter((hash) => hash !== entityId)
    const sizeOf = (hash: string) => deployData.files.get(hash)?.byteLength ?? 0
    const totalBytes = allContentHashes.reduce((acc, hash) => acc + sizeOf(hash), 0)

    // Files are never split across requests, so a single file above the request cap would produce a
    // request the infrastructure may time out — and the resume loop would re-upload it on every
    // attempt. Fail fast with a clear message instead of uploading hundreds of MB that cannot succeed.
    const oversized = allContentHashes.find((hash) => sizeOf(hash) > maxBatchSizeBytes)
    if (oversized) {
      throw new PartialDeploymentValidationError(
        `The file '${oversized}' (${sizeOf(oversized)} bytes) exceeds the maximum request size of ` +
          `${maxBatchSizeBytes} bytes and files cannot be split across requests. If your infrastructure ` +
          `allows larger requests, raise options.maxBatchSizeBytes.`
      )
    }

    // Request-scoped options without the partial-specific keys or the abort signal (the caller signal
    // and the pool controller are combined once per session in runSession and threaded from there).
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

    // Sends one request. Throws a terminal DeploymentError for a 4xx validation/not-supported failure,
    // and a plain Error for retryable conditions (429 rate-limited, 5xx, network) which the resume loop
    // re-attempts. `signal` is already combined by the caller (caller cancellation + pool abort) — it
    // is combined once per session rather than per request so a large upload doesn't accumulate one
    // abort listener on the caller's signal per batch.
    const sendRequest = async (fileHashes: string[], signal?: AbortSignal): Promise<BatchOutcome> => {
      const form = buildDeploymentForm(deployData, fileHashes, true)
      const requestOptions = mergeRequestOptions(requestBase, { body: form as any, method: 'POST', signal })
      const response: FetchResponse = await fetcher.fetch(`${contentUrl}/entities`, requestOptions)
      if (response.status === 200) {
        // A 200 means the server finalized the deployment; a body that fails to parse (empty, proxy
        // rewrite) must not turn that success into a retry storm — every retry would re-observe the
        // same deployed entity. Fall back to a response-time timestamp.
        const result = await response.json().catch(() => ({ creationTimestamp: Date.now() } as PartialDeploymentResult))
        return { kind: 'deployed', result: result as PartialDeploymentResult }
      }
      if (response.status === 202) {
        // Consume the body even though the outcome doesn't need it: with native fetch an unread
        // response body pins the undici socket and buffered bytes, and a large upload produces one
        // 202 per non-finalizing batch.
        await response.json().catch(() => undefined)
        return { kind: 'incomplete' }
      }
      const body = await response.text().catch(() => '')
      // 429 (rate limited / other transient conditions the server surfaces as 429) and 5xx are
      // retryable — the resume loop re-queries available content and re-uploads only what's missing.
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Server responded with status ${response.status}: ${body}`)
      }
      // Any other non-2xx (4xx) is a terminal validation or not-supported error.
      throw classify4xx(response.status, body)
    }

    const runSession = async (): Promise<PartialDeploymentResult> => {
      if (callerSignal?.aborted) {
        throw new Error('The partial deployment was aborted by the caller.')
      }
      const alreadyOnServer =
        allContentHashes.length > 0
          ? await hashesAlreadyOnServer(allContentHashes, { ...requestBase, signal: callerSignal })
          : new Set<string>()
      const missingFiles = new Map<string, Uint8Array>()
      for (const hash of allContentHashes) {
        if (!alreadyOnServer.has(hash)) {
          missingFiles.set(hash, deployData.files.get(hash)!)
        }
      }
      const batches = splitIntoBatches(missingFiles, maxBatchSizeBytes)
      const totalBatches = Math.max(1, batches.length)

      let uploadedBytes = totalBytes - Array.from(missingFiles.values()).reduce((acc, f) => acc + f.byteLength, 0)
      let completedBatches = 0
      const reportProgress = () => onProgress?.({ uploadedBytes, totalBytes, completedBatches, totalBatches })

      // First request carries the entity file (the server needs the manifest before parallel batches).
      const first = await sendRequest([entityId, ...(batches[0]?.hashes ?? [])], callerSignal)
      if (first.kind === 'deployed') {
        return first.result
      }
      if (batches[0]) {
        uploadedBytes += batches[0].sizeBytes
        completedBatches++
        reportProgress()
      }

      // Remaining batches through a bounded worker pool. First 200 wins; a terminal error aborts the rest.
      const remaining = batches.slice(1)
      const controller = new AbortController()
      // Combined once per session: aborts when the caller cancels or when the pool wins/fails. Disposed
      // after the pool drains so a long-lived caller signal doesn't accumulate one listener per session.
      const { signal: sessionSignal, dispose: disposeSessionSignal } = combineSignals([callerSignal, controller.signal])
      let deployed: PartialDeploymentResult | undefined
      let terminalError: DeploymentError | undefined
      let nextIndex = 0

      const worker = async (): Promise<void> => {
        while (!deployed && !terminalError) {
          const index = nextIndex++
          if (index >= remaining.length) {
            return
          }
          const batch = remaining[index]
          try {
            const outcome = await sendRequest(batch.hashes, sessionSignal)
            if (outcome.kind === 'deployed') {
              deployed = outcome.result
              controller.abort()
              return
            }
            uploadedBytes += batch.sizeBytes
            completedBatches++
            reportProgress()
          } catch (error) {
            if (error instanceof DeploymentError) {
              terminalError = error
              controller.abort()
              return
            }
            // A sibling worker already finalized (or the pool was aborted), so this request was
            // cancelled on purpose — swallow its abort/network error instead of failing the session
            // (which would trigger a spurious resume). Genuine failures still propagate.
            if (deployed || controller.signal.aborted) {
              return
            }
            throw error
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, remaining.length)) }, () => worker()))
      } finally {
        disposeSessionSignal()
      }

      if (terminalError) {
        throw terminalError
      }
      if (deployed) {
        return deployed
      }

      // Every batch returned 202 but the server never finalized: the pending upload's state must have
      // changed under us (expired or replaced by an overlapping deployment). Signal a resume.
      throw new Error('The partial deployment did not finalize; the pending upload may have expired or been replaced.')
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= maxResumeAttempts; attempt++) {
      try {
        return await runSession()
      } catch (error) {
        // 4xx validation / not-supported errors are terminal; anything else (5xx, network, non-finalize)
        // is retried by re-querying available content and re-uploading only what's still missing.
        if (error instanceof DeploymentError) {
          throw error
        }
        // The caller cancelled: the failed request is the abort taking effect, not a transient error —
        // surface it instead of burning resume attempts uploading after cancellation.
        if (callerSignal?.aborted) {
          throw error
        }
        lastError = error
        if (attempt < maxResumeAttempts) {
          // Exponential backoff: transient conditions (429 rate limits, 5xx blips) rarely clear within
          // a fixed short delay, and hammering a rate limiter only extends the window. Capped so a
          // large maxResumeAttempts can't grow 2^attempt into multi-hour/day sleeps.
          await delay(Math.min(resumeDelay * 2 ** attempt, MAX_RESUME_BACKOFF_MS))
        }
      }
    }

    throw new DeploymentError(
      `The partial deployment failed after ${maxResumeAttempts + 1} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
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
