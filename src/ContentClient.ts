import { hashV0, hashV1 } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { Fetcher, mergeRequestOptions, RequestOptions, retry, ServerStatus } from 'dcl-catalyst-commons'
import FormData from 'form-data'
import { AvailableContentResult, ContentAPI } from './ContentAPI'
import { DeploymentBuilder, DeploymentData, DeploymentPreparationData } from './utils/DeploymentBuilder'
import { addModelToFormData, getHeadersWithUserAgent, isNode, sanitizeUrl, splitAndFetch } from './utils/Helper'

export type ContentClientOptions = {
  contentUrl: string
  fetcher?: Fetcher
  deploymentBuilderClass?: typeof DeploymentBuilder
}

export class ContentClient implements ContentAPI {
  private readonly contentUrl: string
  private readonly fetcher: Fetcher
  private readonly deploymentBuilderClass: typeof DeploymentBuilder

  constructor(options: ContentClientOptions) {
    this.contentUrl = sanitizeUrl(options.contentUrl)
    this.fetcher = options.fetcher
      ? options.fetcher
      : new Fetcher({
          headers: getHeadersWithUserAgent('content-client')
        })
    this.deploymentBuilderClass = options.deploymentBuilderClass ? options.deploymentBuilderClass : DeploymentBuilder
  }

  async buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata,
    timestamp
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ? timestamp : Date.now()
    return this.deploymentBuilderClass.buildEntityWithoutNewFiles({
      type,
      pointers,
      hashesByKey,
      metadata,
      timestamp: result,
      contentUrl: this.contentUrl
    })
  }

  async buildEntity({
    type,
    pointers,
    files,
    metadata,
    timestamp
  }: BuildEntityOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ? timestamp : Date.now()
    return this.deploymentBuilderClass.buildEntity({
      type,
      pointers,
      files,
      metadata,
      timestamp: result
    })
  }

  async buildEntityFormDataForDeployment(deployData: DeploymentData, options?: RequestOptions) {
    // Check if we are running in node or browser
    const areWeRunningInNode = isNode()

    const form = new FormData()
    form.append('entityId', deployData.entityId)
    addModelToFormData(deployData.authChain, form, 'authChain')

    const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
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

  async deployEntity(deployData: DeploymentData, _fix: boolean = false, options?: RequestOptions): Promise<number> {
    const { creationTimestamp } = (await this.deploy(deployData, options)) as { creationTimestamp: number }
    return creationTimestamp
  }

  async deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    const form = await this.buildEntityFormDataForDeployment(deployData, options)

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: form as any,
      method: 'POST'
    })

    return await this.fetcher.fetch(`${this.contentUrl}/entities`, requestOptions)
  }

  async fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]> {
    if (pointers.length === 0) {
      return Promise.reject(`You must set at least one pointer.`)
    }
    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ pointers: pointers }),
      method: 'POST'
    })

    return (await this.fetcher.fetch(`${this.contentUrl}/entities/active`, requestOptions)).json()
  }

  async fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]> {
    if (ids.length === 0) {
      return Promise.reject(`You must set at least one id.`)
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ ids: ids }),
      method: 'POST'
    })

    return (await this.fetcher.fetch(`${this.contentUrl}/entities/active`, requestOptions)).json()
  }

  async fetchEntityById(id: string, options?: RequestOptions): Promise<Entity> {
    const entities: Entity[] = await this.fetchEntitiesByIds([id], options)
    if (entities.length === 0) {
      return Promise.reject(`Failed to find an entity with id '${id}'.`)
    }
    return entities[0]
  }

  fetchAuditInfo(type: EntityType, id: string, options?: RequestOptions) {
    return this.fetchJson(`/audit/${type}/${id}`, options)
  }

  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.fetchJson('/status', options)
  }

  async downloadContent(contentHash: string, options?: Partial<RequestOptions>): Promise<Buffer> {
    const { attempts = 3, waitTime = '0.5s' } = options ? options : {}
    const timeout = options?.timeout ? { timeout: options.timeout } : {}

    return retry(
      async () => {
        const content = await this.fetcher.fetchBuffer(`${this.contentUrl}/contents/${contentHash}`, timeout)
        const downloadedHash = contentHash.startsWith('Qm') ? await hashV0(content) : await hashV1(content)

        // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
        // So we will check the hash before considering the download successful.
        if (downloadedHash === contentHash) {
          return content
        }
        throw new Error(`Failed to fetch file with hash ${contentHash} from ${this.contentUrl}`)
      },
      attempts,
      waitTime
    )
  }

  async pipeContent(
    contentHash: string,
    writeTo: any,
    options?: Partial<RequestOptions>
  ): Promise<Map<string, string>> {
    return this.onlyKnownHeaders(
      await this.fetcher.fetchPipe(`${this.contentUrl}/contents/${contentHash}`, writeTo, options)
    )
  }

  private KNOWN_HEADERS: string[] = [
    'Content-Type',
    'Access-Control-Allow-Origin',
    'Access-Control-Expose-Headers',
    'ETag',
    'Date',
    'Content-Length',
    'Cache-Control'
  ]

  private fixHeaderNameCase(headerName: string): string | undefined {
    return this.KNOWN_HEADERS.find((item) => item.toLowerCase() === headerName.toLowerCase())
  }

  private onlyKnownHeaders(headersFromResponse: Headers): Map<string, string> {
    const headers: Map<string, string> = new Map()
    headersFromResponse?.forEach((headerValue, headerName) => {
      const fixedHeader = this.fixHeaderNameCase(headerName)
      if (fixedHeader) {
        headers.set(fixedHeader, headerValue)
      }
    })
    return headers
  }

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
    if (cids.length === 0) {
      return Promise.reject(`You must set at least one cid.`)
    }

    return splitAndFetch<{ cid: string; available: boolean }>({
      fetcher: this.fetcher,
      baseUrl: this.contentUrl,
      path: `/available-content`,
      queryParams: { name: 'cid', values: cids },
      uniqueBy: 'cid',
      options
    })
  }

  getContentUrl(): string {
    return this.contentUrl
  }

  /** Given an array of file hashes, return a set with those already uploaded on the server */
  private async hashesAlreadyOnServer(hashes: string[], options: RequestOptions | undefined): Promise<Set<string>> {
    const result: AvailableContentResult = await this.isContentAvailable(hashes, options)

    const alreadyUploaded = result.filter(($) => $.available).map(({ cid }) => cid)

    return new Set(alreadyUploaded)
  }

  private async fetchJson(path: string, options?: Partial<RequestOptions>): Promise<any> {
    return (await this.fetcher.fetch(`${this.contentUrl}${path}`, options)).json()
  }
}

export interface BuildEntityOptions {
  type: EntityType
  pointers: string[]
  files?: Map<string, Uint8Array>
  metadata?: any
  timestamp?: number
}

export interface BuildEntityWithoutFilesOptions {
  type: EntityType
  pointers: string[]
  hashesByKey?: Map<string, string>
  metadata?: any
  timestamp?: number
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
export class DeploymentFields {
  static readonly AUDIT_INFO = new DeploymentFields(['auditInfo'])
  static readonly POINTERS_CONTENT_METADATA_AND_AUDIT_INFO = new DeploymentFields([
    'pointers',
    'content',
    'metadata',
    'auditInfo'
  ])
  static readonly POINTERS_CONTENT_AND_METADATA = new DeploymentFields(['pointers', 'content', 'metadata'])

  private constructor(private readonly fields: string[]) {}

  getFields(): string {
    return this.fields.join(',')
  }

  isFieldIncluded(name: string) {
    return this.fields.includes(name)
  }
}

function arrayBufferFrom(value: Buffer | Uint8Array) {
  if (value.buffer) {
    return value.buffer
  }
  return value
}
