import { hashV0, hashV1 } from '@dcl/hashing'
import { Entity } from '@dcl/schemas'
import FormData from 'form-data'
import {
  BuildEntityOptions,
  BuildEntityWithoutFilesOptions,
  ClientOptions,
  DeploymentData,
  DeploymentPreparationData,
  IFetchComponent
} from './types'
import * as builder from './utils/DeploymentBuilder'
import { addModelToFormData, isNode, mergeRequestOptions, sanitizeUrl, splitAndFetch } from './utils/Helper'
import { RequestOptions, withClientAgentInjection } from './utils/fetcher'
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
  /** Build entities */
  buildEntity({ type, pointers, files, metadata }: BuildEntityOptions): Promise<DeploymentPreparationData>
  buildEntityFormDataForDeployment(deployData: DeploymentData, options?: RequestOptions): Promise<FormData>
  buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData>

  /** Retrieve / Download */
  fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntityById(id: string, options?: RequestOptions): Promise<Entity>
  downloadContent(contentHash: string, options?: RequestOptions): Promise<Buffer>

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult>

  /**
   * Deploys an entity to the content server.
   */
  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown>
}

export async function downloadContent(
  fetcher: IFetchComponent,
  baseUrl: string,
  contentHash: string,
  options?: Partial<RequestOptions>
): Promise<Buffer> {
  const { attempts = 3, waitTime = 500 } = options ? options : {}
  const timeout = options?.timeout ? { timeout: options.timeout } : {}

  return retry(
    `fetch file with hash ${contentHash} from ${baseUrl}`,
    async () => {
      const content = await (await fetcher.fetch(`${baseUrl}/${contentHash}`, timeout)).buffer()
      const downloadedHash = contentHash.startsWith('Qm') ? await hashV0(content) : await hashV1(content)

      // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
      // So we will check the hash before considering the download successful.
      if (downloadedHash === contentHash) {
        return content
      }
      throw new Error(`Failed to fetch file with hash ${contentHash} from ${baseUrl}`)
    },
    attempts,
    waitTime
  )
}

export function createContentClient(options: ClientOptions): ContentClient {
  const contentUrl = sanitizeUrl(options.url)
  const fetcher = withClientAgentInjection(options.fetcher)

  async function buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata,
    timestamp
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ? timestamp : Date.now()
    return builder.buildEntityWithoutNewFiles(fetcher, {
      type,
      pointers,
      hashesByKey,
      metadata,
      timestamp: result,
      contentUrl: contentUrl
    })
  }

  async function buildEntity({
    type,
    pointers,
    files,
    metadata,
    timestamp
  }: BuildEntityOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ? timestamp : Date.now()
    return builder.buildEntity({
      type,
      pointers,
      files,
      metadata,
      timestamp: result
    })
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

  async function fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]> {
    if (ids.length === 0) {
      return Promise.reject(`You must set at least one id.`)
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ ids }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    return (await fetcher.fetch(`${contentUrl}/entities/active`, requestOptions)).json()
  }

  async function fetchEntityById(id: string, options?: RequestOptions): Promise<Entity> {
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

  return {
    buildEntity,
    buildEntityFormDataForDeployment,
    buildEntityWithoutNewFiles,
    fetchEntitiesByPointers,
    fetchEntitiesByIds,
    fetchEntityById,
    downloadContent: (contentHash: string, options?: Partial<RequestOptions>) => {
      return downloadContent(fetcher, contentUrl + '/contents', contentHash, options)
    },
    deploy,
    isContentAvailable
  }
}
