import { hashV0, hashV1 } from '@dcl/hashing'
import {
  AvailableContentResult,
  ContentFileHash,
  Deployment,
  DeploymentWithAuditInfo,
  Entity,
  EntityId,
  EntityMetadata,
  EntityType,
  EntityVersion,
  Fetcher,
  LegacyAuditInfo,
  mergeRequestOptions,
  Pointer,
  RequestOptions,
  retry,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import FormData from 'form-data'
import { ContentAPI, DeploymentWithMetadataContentAndPointers } from './ContentAPI'
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
    this.fetcher =
      options.fetcher ??
      new Fetcher({
        headers: getHeadersWithUserAgent('content-client')
      })
    this.deploymentBuilderClass = options.deploymentBuilderClass ?? DeploymentBuilder
  }

  async buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata,
    timestamp
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ?? Date.now()
    return this.deploymentBuilderClass.buildEntityWithoutNewFiles({
      version: EntityVersion.V3,
      type,
      pointers,
      hashesByKey,
      metadata,
      timestamp: result
    })
  }

  async buildEntity({
    type,
    pointers,
    files,
    metadata,
    timestamp
  }: BuildEntityOptions): Promise<DeploymentPreparationData> {
    const result = timestamp ?? Date.now()
    return this.deploymentBuilderClass.buildEntity({
      version: EntityVersion.V3,
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

  async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
    const form = await this.buildEntityFormDataForDeployment(deployData, options)

    const requestOptions = mergeRequestOptions(options ?? {}, {
      body: form as any
    })

    const { creationTimestamp } = (await this.fetcher.postForm(
      `${this.contentUrl}/entities${fix ? '?fix=true' : ''}`,
      requestOptions
    )) as any
    return creationTimestamp
  }

  fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
    if (pointers.length === 0) {
      return Promise.reject(`You must set at least one pointer.`)
    }

    return splitAndFetch<Entity>({
      fetcher: this.fetcher,
      baseUrl: this.contentUrl,
      path: `/entities/${type}`,
      queryParams: { name: 'pointer', values: pointers },
      uniqueBy: 'id',
      options
    })
  }

  fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
    if (ids.length === 0) {
      return Promise.reject(`You must set at least one id.`)
    }

    return splitAndFetch<Entity>({
      fetcher: this.fetcher,
      baseUrl: this.contentUrl,
      path: `/entities/${type}`,
      queryParams: { name: 'id', values: ids },
      uniqueBy: 'id',
      options
    })
  }

  async fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity> {
    const entities: Entity[] = await this.fetchEntitiesByIds(type, [id], options)
    if (entities.length === 0) {
      return Promise.reject(`Failed to find an entity with type '${type}' and id '${id}'.`)
    }
    return entities[0]
  }

  fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<LegacyAuditInfo> {
    return this.fetchJson(`/audit/${type}/${id}`, options)
  }

  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.fetchJson('/status', options)
  }

  async downloadContent(contentHash: ContentFileHash, options?: Partial<RequestOptions>): Promise<Buffer> {
    const { attempts = 3, waitTime = '0.5s' } = options ?? {}
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
    contentHash: ContentFileHash,
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

    return splitAndFetch<{ cid: ContentFileHash; available: boolean }>({
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
  private async hashesAlreadyOnServer(
    hashes: ContentFileHash[],
    options: RequestOptions | undefined
  ): Promise<Set<ContentFileHash>> {
    const result: AvailableContentResult = await this.isContentAvailable(hashes, options)

    const alreadyUploaded = result.filter(($) => $.available).map(({ cid }) => cid)

    return new Set(alreadyUploaded)
  }

  private fetchJson(path: string, options?: Partial<RequestOptions>): Promise<any> {
    return this.fetcher.fetchJson(`${this.contentUrl}${path}`, options)
  }
}

export interface BuildEntityOptions {
  type: EntityType
  pointers: Pointer[]
  files?: Map<string, Uint8Array>
  metadata?: EntityMetadata
  timestamp?: Timestamp
}

export interface BuildEntityWithoutFilesOptions {
  type: EntityType
  pointers: Pointer[]
  hashesByKey?: Map<string, ContentFileHash>
  metadata?: EntityMetadata
  timestamp?: Timestamp
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
export class DeploymentFields<T extends Partial<Deployment>> {
  static readonly AUDIT_INFO = new DeploymentFields<DeploymentWithAuditInfo>(['auditInfo'])
  static readonly POINTERS_CONTENT_METADATA_AND_AUDIT_INFO = new DeploymentFields<Deployment>([
    'pointers',
    'content',
    'metadata',
    'auditInfo'
  ])
  static readonly POINTERS_CONTENT_AND_METADATA = new DeploymentFields<DeploymentWithMetadataContentAndPointers>([
    'pointers',
    'content',
    'metadata'
  ])

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
