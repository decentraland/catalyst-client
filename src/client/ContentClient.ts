import { hashV0, hashV1 } from '@dcl/hashing'
import { Entity } from '@dcl/schemas'
import { IFetchComponent, RequestOptions } from '@well-known-components/interfaces'
import FormData from 'form-data'
import { ClientOptions, DeploymentData } from './types'
import { addModelToFormData, isNode, mergeRequestOptions, sanitizeUrl, splitAndFetch } from './utils/Helper'
import { retry } from './utils/retry'
import { Response } from '@well-known-components/interfaces/dist/components/fetcher'

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
  fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntityById(id: string, options?: RequestOptions): Promise<Entity>
  downloadContent(contentHash: string, options?: RequestOptions & { avoidChecks?: boolean }): Promise<Buffer>

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

async function supportsDeploymentsV2(serverBaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverBaseUrl}/v2/entities/:entityId/files/:fileHash`, { method: 'OPTIONS' })
    return response.ok // returns true if response status is 200-299
  } catch (error) {
    console.log(error)
    console.error(`Error: ${error}`)
    return false
  }
}

export function createContentClient(options: ClientOptions): ContentClient {
  const { fetcher } = options
  const contentUrl = sanitizeUrl(options.url)

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

  async function buildFileUploadRequestsForDeploymentV2(
    deployData: DeploymentData,
    options?: RequestOptions
  ): Promise<(() => Promise<Response>)[]> {
    // Check if we are running in node or browser
    const areWeRunningInNode = isNode()

    const requests: (() => Promise<Response>)[] = []
    const alreadyUploadedHashes = await hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    for (const [fileHash, file] of deployData.files) {
      if (!alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId) {
        const content = areWeRunningInNode
          ? Buffer.isBuffer(file) // Node.js
            ? file
            : Buffer.from(arrayBufferFrom(file))
          : arrayBufferFrom(file) // Browser

        requests.push(
          (): Promise<Response> =>
            fetcher.fetch(`${contentUrl}/v2/entities/${deployData.entityId}/files/${fileHash}`, {
              headers: {
                'Content-Type': 'application/octet-stream'
              },
              method: 'POST',
              body: content
            })
        )
      }
    }

    return requests
  }

  async function deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    // // TODO Undo this and leave the logic below
    // return deployV2(deployData, options)

    // TODO We could also check the deployment size (if too small, may not be worth to use V2)
    if (deployData.files.size > 0) {
      const supportsV2 = await supportsDeploymentsV2(contentUrl)
      if (supportsV2) {
        return deployV2(deployData, options)
      }
    }
    return deployTraditional(deployData, options)
  }

  async function deployTraditional(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    const form = await buildEntityFormDataForDeployment(deployData, options)

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: form as any,
      method: 'POST'
    })

    return await fetcher.fetch(`${contentUrl}/entities`, requestOptions)
  }

  async function deployV2(deployData: DeploymentData, options: RequestOptions = {}): Promise<unknown> {
    const fileUploadRequests = await buildFileUploadRequestsForDeploymentV2(deployData, options)

    const response = await fetcher.fetch(`${contentUrl}/v2/entities/${deployData.entityId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        authChain: deployData.authChain,
        files: Object.fromEntries(Array.from(deployData.files, ([key, value]) => [key, value.byteLength]))
      })
    })
    if (!response.ok) {
      throw new Error(`Failed to deploy entity with id '${deployData.entityId}'.`)
    }
    console.log('Deployment started successfully! Uploading files...')

    await Promise.all(fileUploadRequests.map((request) => request()))
    console.log('Files uploaded successfully! Finishing deployment...')

    const response2 = await fetcher.fetch(`${contentUrl}/v2/entities/${deployData.entityId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: ''
    })

    if (!response2.ok) {
      throw new Error(`Failed to deploy entity with id '${deployData.entityId}'.`)
    }

    return !!response2
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
    buildEntityFormDataForDeployment,
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
