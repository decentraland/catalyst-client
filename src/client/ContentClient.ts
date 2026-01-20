import { hashV0, hashV1 } from '@dcl/hashing'
import { Entity } from '@dcl/schemas'
import { IFetchComponent, RequestOptions } from '@well-known-components/interfaces'
import FormData from 'form-data'
import { ClientOptions, DeploymentData, ParallelConfig } from './types'
import { addModelToFormData, isNode, mergeRequestOptions, sanitizeUrl, splitAndFetch } from './utils/Helper'
import { retry } from './utils/retry'

function arrayBufferFrom(value: Buffer | Uint8Array) {
  if (value.buffer) {
    return value.buffer
  }
  return value
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
  downloadContent(contentHash: string, options?: RequestOptions & { avoidChecks?: boolean }): Promise<Buffer>

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult>

  /**
   * Deploys an entity to the content server.
   */
  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown>

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
    failedServers?: number
  }>
}

export async function downloadContent(
  fetcher: IFetchComponent,
  baseUrl: string,
  contentHash: string,
  options?: Partial<RequestOptions> & { avoidChecks?: boolean }
): Promise<Buffer> {
  const { attempts = 3, retryDelay = 500 } = options ? options : {}
  const timeout = options?.timeout ? { timeout: options.timeout } : {}

  return retry(
    `fetch file with hash ${contentHash} from ${baseUrl}`,
    async () => {
      const content = await (await fetcher.fetch(`${baseUrl}/${contentHash}`, timeout)).buffer()
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
    const requestOptionsWithSignal = mergeRequestOptions(requestOptions, { signal: controller.signal })

    let hasResolved = false
    let resolveRace: (entities: Entity[]) => void
    const racePromise = new Promise<Entity[]>((resolve) => {
      resolveRace = resolve
    })

    let pendingCount = urls.length

    const fetchOne = async (url: string): Promise<void> => {
      try {
        const serverUrl = sanitizeUrl(url)
        const response = await fetcher.fetch(`${serverUrl}${path}`, requestOptionsWithSignal)

        if (!hasResolved && response.ok) {
          const entities = await response.json()
          if (Array.isArray(entities) && entities.length > 0) {
            hasResolved = true
            controller.abort()
            resolveRace(entities)
            return
          }
        }

        if (!response.ok && !controller.signal.aborted) {
          logger?.warn(`Failed to fetch from ${url}: HTTP ${response.status}`)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger?.warn(`Failed to fetch from ${url}:`, error)
        }
      } finally {
        pendingCount--
        if (pendingCount === 0 && !hasResolved) {
          resolveRace([])
        }
      }
    }

    urls.forEach((url) => fetchOne(url))

    return racePromise
  }

  async function fetchFromMultipleServersAllWithResults(
    urls: string[],
    path: string,
    requestOptions: RequestOptions
  ): Promise<{ entities: Entity[]; emptyResults: number; failedServers: number }> {
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const serverUrl = sanitizeUrl(url)
        const response = await fetcher.fetch(`${serverUrl}${path}`, requestOptions)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        return (await response.json()) as Entity[]
      })
    )

    let emptyResults = 0
    let failedServers = 0
    const allEntities: Entity[] = []

    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failedServers++
        logger?.warn(`Failed to fetch from ${urls[index]}:`, result.reason)
      } else {
        const entities = result.value ?? []
        if (entities.length === 0) {
          emptyResults++
        }
        allEntities.push(...entities)
      }
    }

    const uniqueEntities = new Map<string, Entity>()
    for (const entity of allEntities) {
      const existing = uniqueEntities.get(entity.id)
      if (!existing || entity.timestamp > existing.timestamp) {
        uniqueEntities.set(entity.id, entity)
      }
    }

    return {
      entities: Array.from(uniqueEntities.values()),
      emptyResults,
      failedServers
    }
  }

  async function buildEntityFormDataForDeployment(
    deployData: DeploymentData,
    options?: RequestOptions
  ): Promise<FormData> {
    // Check if we are running in node or browser
    const areWeRunningInNode = isNode()

    const form = new FormData()
    form.append('entityId', deployData.entityId)
    addModelToFormData(deployData.authChain, form, 'authChain')

    const alreadyUploadedHashes = await hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    for (const [fileHash, file] of deployData.files) {
      if (!alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId) {
        if (areWeRunningInNode) {
          // Node
          form.append(
            fileHash,
            Buffer.isBuffer(file) ? file : Buffer.from(arrayBufferFrom(file) as ArrayBuffer),
            fileHash
          )
        } else {
          // Browser
          form.append(fileHash, new Blob([arrayBufferFrom(file) as ArrayBuffer]), fileHash)
        }
      }
    }

    return form
  }

  async function deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    const form = await buildEntityFormDataForDeployment(deployData, options)

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: form as any,
      method: 'POST'
    })

    return await fetcher.fetch(`${contentUrl}/entities`, requestOptions)
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
    failedServers?: number
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
    const { entities, emptyResults, failedServers } = await fetchFromMultipleServersAllWithResults(
      allUrls,
      '/entities/active',
      requestOptions
    )

    if (entities.length === 0) {
      return {
        isConsistent: failedServers === 0,
        upToDateEntities: undefined,
        outdatedEntities: undefined,
        failedServers: failedServers > 0 ? failedServers : undefined
      }
    }

    const newestTimestamp = Math.max(...entities.map((e) => e.timestamp))

    const newerEntities = entities.filter((e) => e.timestamp === newestTimestamp)
    const olderEntities = entities.filter((e) => e.timestamp < newestTimestamp)

    const isConsistent = olderEntities.length === 0 && emptyResults === 0 && failedServers === 0

    return {
      isConsistent,
      upToDateEntities: newerEntities.length > 0 ? newerEntities : undefined,
      outdatedEntities: olderEntities.length > 0 ? olderEntities : undefined,
      failedServers: failedServers > 0 ? failedServers : undefined
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
    isContentAvailable,
    checkPointerConsistency
  }
}
