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

    // Request-scoped options without the partial-specific keys, so they aren't forwarded to fetch.
    const requestBase: RequestOptions = {
      headers: options?.headers,
      timeout: options?.timeout,
      attempts: options?.attempts,
      retryDelay: options?.retryDelay,
      signal: options?.signal,
      abortController: options?.abortController
    }

    const classify4xx = (status: number, body: string): DeploymentError => {
      if (/neither present in the storage/i.test(body)) {
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

    // Sends one request. Throws a DeploymentError for terminal (4xx) failures and a plain Error for
    // retryable ones (5xx / network), which the resume loop distinguishes by `instanceof DeploymentError`.
    const sendRequest = async (fileHashes: string[], signal?: AbortSignal): Promise<BatchOutcome> => {
      const form = buildDeploymentForm(deployData, fileHashes, true)
      const requestOptions = mergeRequestOptions(requestBase, { body: form as any, method: 'POST', signal })
      const response: FetchResponse = await fetcher.fetch(`${contentUrl}/entities`, requestOptions)
      if (response.status === 200) {
        return { kind: 'deployed', result: (await response.json()) as PartialDeploymentResult }
      }
      if (response.status === 202) {
        return { kind: 'incomplete' }
      }
      const body = await response.text().catch(() => '')
      if (response.status >= 400 && response.status < 500) {
        throw classify4xx(response.status, body)
      }
      throw new Error(`Server responded with status ${response.status}: ${body}`)
    }

    const runSession = async (): Promise<PartialDeploymentResult> => {
      const alreadyOnServer =
        allContentHashes.length > 0 ? await hashesAlreadyOnServer(allContentHashes, requestBase) : new Set<string>()
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
      const first = await sendRequest([entityId, ...(batches[0]?.hashes ?? [])])
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
            const outcome = await sendRequest(batch.hashes, controller.signal)
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
            throw error
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, remaining.length)) }, () => worker()))

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
        lastError = error
        if (attempt < maxResumeAttempts) {
          await delay(resumeDelay)
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
