require('isomorphic-form-data')
import {
  Timestamp,
  Pointer,
  EntityType,
  Entity,
  EntityId,
  ServerStatus,
  ContentFileHash,
  PartialDeploymentHistory,
  applySomeDefaults,
  retry,
  Fetcher,
  Hashing,
  DeploymentFilters,
  Deployment,
  AvailableContentResult,
  DeploymentBase,
  DeploymentWithAuditInfo,
  LegacyAuditInfo,
  DeploymentSorting,
  RequestOptions,
  mergeRequestOptions
} from 'dcl-catalyst-commons'
import asyncToArray from 'async-iterator-to-array'
import { Readable } from 'stream'
import { ContentAPI, DeploymentWithMetadataContentAndPointers } from './ContentAPI'
import {
  addModelToFormData,
  convertFiltersToQueryParams,
  sanitizeUrl,
  splitAndFetch,
  splitValuesIntoManyQueries
} from './utils/Helper'
import { DeploymentData } from './utils/DeploymentBuilder'
import { RUNNING_VERSION } from './utils/Environment'

export class ContentClient implements ContentAPI {
  private static readonly CHARS_LEFT_FOR_OFFSET = 7
  private readonly contentUrl: string
  private readonly fetcher: Fetcher

  constructor(
    contentUrl: string,
    private readonly origin: string, // The name or a description of the app that is using the client
    fetcher?: Fetcher
  ) {
    this.contentUrl = sanitizeUrl(contentUrl)
    this.fetcher =
      fetcher ??
      new Fetcher({
        headers: {
          'User-Agent': `content-client/${RUNNING_VERSION} (+https://github.com/decentraland/catalyst-client)`
        }
      })
  }

  async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
    const form = new FormData()
    form.append('entityId', deployData.entityId)
    addModelToFormData(deployData.authChain, form, 'authChain')

    // Check if we are running in node or browser
    const isNode = typeof window === 'undefined' || !this.isBlobAvailable()

    const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    for (const [fileHash, file] of deployData.files) {
      if (!alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId) {
        if (isNode) {
          // Node
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          form.append(file.name, file.content, file.name)
        } else {
          // Browser
          form.append(file.name, new Blob([file.content.buffer]), file.name)
        }
      }
    }

    const requestOptions = mergeRequestOptions(options ?? {}, {
      body: form,
      headers: { 'x-upload-origin': this.origin }
    })

    const { creationTimestamp } = await this.fetcher.postForm(
      `${this.contentUrl}/entities${fix ? '?fix=true' : ''}`,
      requestOptions
    )
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
        const downloadedHash = await Hashing.calculateBufferHash(content)
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
    writeTo: ReadableStream<Uint8Array>,
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

  /**
   * This method fetches all deployments that match the given filters.
   *  It is important to mention, that if there are too many filters, then the URL might get too long.
   *  In that case, we will internally make the necessary requests,
   *  but then the order of the deployments is not guaranteed.
   */
  fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]> {
    return asyncToArray(this.iterateThroughDeployments(deploymentOptions, options))
  }

  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Readable {
    return Readable.from(this.iterateThroughDeployments(deploymentOptions, options))
  }

  private async *iterateThroughDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
    options?: RequestOptions
  ): AsyncIterable<T> {
    // We are setting different defaults in this case, because if one of the request fails, then all fail
    const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)

    // Transform filters object into query params map
    const filterQueryParams: Map<string, string[]> = convertFiltersToQueryParams(deploymentOptions?.filters)

    // Validate that some params were used, so that not everything is fetched
    this.assertFiltersAreSet(deploymentOptions?.filters)

    // Transform sorting object into query params map
    const sortingQueryParams = this.sortingToQueryParams(deploymentOptions?.sortBy)

    // Initialize query params with filters and sorting
    const queryParams = new Map([...filterQueryParams, ...sortingQueryParams])

    if (deploymentOptions?.fields) {
      const fieldsValue = deploymentOptions?.fields.getFields()
      queryParams.set('fields', [fieldsValue])
    }

    // Reserve a few chars to send the offset
    const reservedChars = `&offset=`.length + ContentClient.CHARS_LEFT_FOR_OFFSET

    // Split values into different queries
    const queries = splitValuesIntoManyQueries({
      baseUrl: this.contentUrl,
      path: '/deployments',
      queryParams,
      reservedChars
    })

    // Perform the different queries
    const foundIds: Set<EntityId> = new Set()
    let exit = false
    for (let i = 0; i < queries.length && !exit; i++) {
      const query = queries[i]
      let offset = 0
      let keepRetrievingHistory = true
      while (keepRetrievingHistory && !exit) {
        const url = query + (queryParams.size === 0 ? '?' : '&') + `offset=${offset}`
        try {
          const partialHistory: PartialDeploymentHistory<T> = await this.fetcher.fetchJson(url, withSomeDefaults)
          for (const deployment of partialHistory.deployments) {
            if (!foundIds.has(deployment.entityId)) {
              foundIds.add(deployment.entityId)
              yield deployment
            }
          }
          offset = partialHistory.pagination.offset + partialHistory.pagination.limit
          keepRetrievingHistory = partialHistory.pagination.moreData
        } catch (error) {
          if (deploymentOptions?.errorListener) {
            deploymentOptions.errorListener(`${error}`)
          }
          exit = true
        }
      }
    }
  }

  private assertFiltersAreSet(filters: DeploymentFilters | undefined) {
    const filtersAreSet =
      filters?.fromLocalTimestamp ||
      filters?.toLocalTimestamp ||
      (filters?.deployedBy && filters?.deployedBy.length > 0) ||
      (filters?.entityTypes && filters?.entityTypes.length > 0) ||
      (filters?.entityIds && filters?.entityIds.length > 0) ||
      (filters?.pointers && filters?.pointers.length > 0)
    if (!filtersAreSet) {
      throw new Error(`When fetching deployments, you must set at least one filter that isn't 'onlyCurrentlyPointed'`)
    }
  }

  private sortingToQueryParams(sort?: DeploymentSorting): Map<string, string[]> {
    const sortQueryParams: Map<string, string[]> = new Map()
    if (sort?.field) {
      sortQueryParams.set('sortingField', [sort.field])
    }
    if (sort?.order) {
      sortQueryParams.set('sortingOrder', [sort.order])
    }
    return sortQueryParams
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

    const alreadyUploaded = result.filter(({ available }) => available).map(({ cid }) => cid)

    return new Set(alreadyUploaded)
  }

  private fetchJson(path: string, options?: Partial<RequestOptions>): Promise<any> {
    return this.fetcher.fetchJson(`${this.contentUrl}${path}`, options)
  }

  private isBlobAvailable(): boolean {
    try {
      new Blob()
      return true
    } catch {
      return false
    }
  }
}

export type DeploymentOptions<T> = {
  filters: DeploymentFilters
  sortBy?: DeploymentSorting
  fields?: DeploymentFields<T>
  errorListener?: (errorMessage: string) => void
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
}
