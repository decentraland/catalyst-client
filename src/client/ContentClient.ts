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
    newerEntities?: Entity[]
    olderEntities?: Entity[]
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
    const signal = controller.signal

    const requestOptionsWithSignal = mergeRequestOptions(requestOptions, {
      signal
    })

    return new Promise<Entity[]>(async (resolve) => {
      let completedCount = 0

      urls.forEach(async (url) => {
        try {
          const serverUrl = sanitizeUrl(url)
          const response = await fetcher.fetch(`${serverUrl}${path}`, requestOptionsWithSignal)

          if (signal.aborted) {
            completedCount++
            if (completedCount === urls.length) {
              resolve([])
            }
            return
          }

          const entities = await response.json()

          completedCount++

          if (entities && Array.isArray(entities) && entities.length > 0) {
            controller.abort()
            resolve(entities)
            return
          }

          if (completedCount === urls.length) {
            resolve([])
          }
        } catch (error) {
          if (!signal.aborted) {
            logger?.warn(`Failed to fetch from ${url}:`, error)
          }

          completedCount++
          if (completedCount === urls.length) {
            resolve([])
          }
        }
      })
    })
  }

  async function fetchFromMultipleServersAll(
    urls: string[],
    path: string,
    requestOptions: RequestOptions
  ): Promise<Entity[]> {
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

    const allEntities = results
      .filter((result): result is PromiseFulfilledResult<Entity[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value)

    const uniqueEntities = new Map<string, Entity>()
    allEntities.forEach((entity) => {
      if (!uniqueEntities.has(entity.id) || entity.timestamp > uniqueEntities.get(entity.id)!.timestamp) {
        uniqueEntities.set(entity.id, entity)
      }
    })

    return Array.from(uniqueEntities.values())
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
          form.append(fileHash, Buffer.isBuffer(file) ? file : Buffer.from(arrayBufferFrom(file)), fileHash)
        } else {
          // Browser
          form.append(fileHash, new Blob([arrayBufferFrom(file)]), fileHash)
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
    newerEntities?: Entity[]
    olderEntities?: Entity[]
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

    const entities = await fetchFromMultipleServersAll(
      [contentUrl, ...parallelConfig.urls],
      '/entities/active',
      requestOptions
    )

    if (entities.length === 0) {
      return { isConsistent: true }
    }

    // Find the newest timestamp
    const newestTimestamp = Math.max(...entities.map((e) => e.timestamp))

    const newerEntities = entities.filter((e) => e.timestamp === newestTimestamp)
    const olderEntities = entities.filter((e) => e.timestamp < newestTimestamp)

    return {
      isConsistent: olderEntities.length === 0,
      newerEntities: newerEntities.length > 0 ? newerEntities : undefined,
      olderEntities: olderEntities.length > 0 ? olderEntities : undefined
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
