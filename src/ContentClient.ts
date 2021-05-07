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
  mergeRequestOptions,
  SortingField,
  SortingOrder,
  EntityMetadata
} from 'dcl-catalyst-commons'
import asyncToArray from 'async-iterator-to-array'
import { Readable } from 'stream'
import { ContentAPI, DeploymentWithMetadataContentAndPointers } from './ContentAPI'
import {
  addModelToFormData,
  convertFiltersToQueryParams,
  getHeadersWithUserAgent,
  isNode,
  QueryBuilder,
  sanitizeUrl,
  splitAndFetch,
  splitValuesIntoManyQueryBuilders
} from './utils/Helper'
import { DeploymentBuilder, DeploymentData, DeploymentPreparationData } from './utils/DeploymentBuilder'
import NodeFormData from 'form-data'

export class ContentClient implements ContentAPI {
  private static readonly CHARS_LEFT_FOR_OFFSET = 7
  private readonly contentUrl: string
  private readonly fetcher: Fetcher
  private readonly deploymentBuilderClass: typeof DeploymentBuilder

  constructor(
    contentUrl: string,
    private readonly origin: string, // The name or a description of the app that is using the client
    fetcher?: Fetcher,
    deploymentBuilderClass?: typeof DeploymentBuilder
  ) {
    this.contentUrl = sanitizeUrl(contentUrl)
    this.fetcher =
      fetcher ??
      new Fetcher({
        headers: getHeadersWithUserAgent('content-client')
      })
    this.deploymentBuilderClass = deploymentBuilderClass ?? DeploymentBuilder
  }

  async buildEntity(type: EntityType,
    pointers: Pointer[],
    files: Map<string, Buffer> = new Map(),
    metadata?: EntityMetadata): Promise<DeploymentPreparationData> {
    const result = await this.fetchContentStatus();
    const timestamp = result.currentTime;
    return this.deploymentBuilderClass.buildEntity(type, pointers, files, metadata, timestamp);
  }

  async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
    // Check if we are running in node or browser
    const areWeRunningInNode = isNode()

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const form: FormData = areWeRunningInNode ? new NodeFormData() : new FormData()
    form.append('entityId', deployData.entityId)
    addModelToFormData(deployData.authChain, form, 'authChain')

    const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    for (const [fileHash, file] of deployData.files) {
      if (!alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId) {
        if (areWeRunningInNode) {
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

    // Validate that some params were used, so that not everything is fetched
    this.assertFiltersAreSet(deploymentOptions?.filters)

    // Transform filters object into query params map
    const filterQueryParams: Map<string, string[]> = convertFiltersToQueryParams(deploymentOptions?.filters)

    // Transform sorting object into query params map
    const sortingQueryParams = this.sortingToQueryParams(deploymentOptions?.sortBy)

    // Initialize query params with filters and sorting
    const queryParams = new Map([...filterQueryParams, ...sortingQueryParams])

    if (deploymentOptions?.fields) {
      const fieldsValue = deploymentOptions?.fields.getFields()
      queryParams.set('fields', [fieldsValue])
    }

    // Set legacy filters for get all deployments
    if (deploymentOptions?.sortBy?.field !== SortingField.ENTITY_TIMESTAMP) {
      if (deploymentOptions?.filters.from) {
        const from = deploymentOptions.filters.from
        queryParams.set('fromLocalTimestamp', [`${from}`])
      }
      if (deploymentOptions?.filters.to) {
        const to = deploymentOptions.filters.to
        queryParams.set('toLocalTimestamp', [`${to}`])
      }
    }

    let reservedParams: Map<string, number>
    let modifyQueryBasedOnResult: (result: PartialDeploymentHistory<T>, builder: QueryBuilder) => void

    const canWeUseLocalTimestampInsteadOfOffset =
      deploymentOptions?.fields &&
      deploymentOptions.fields.isFieldIncluded('auditInfo') &&
      (!deploymentOptions?.sortBy || deploymentOptions.sortBy.field === SortingField.LOCAL_TIMESTAMP)

    if (canWeUseLocalTimestampInsteadOfOffset) {
      // Note: the approach used below will get stuck if all 500 deployments on the same page have the same localTimestamp, but that is extremely unlikely
      reservedParams = new Map([
        ['fromLocalTimestamp', 13],
        ['toLocalTimestamp', 13]
      ])
      if (deploymentOptions?.sortBy?.order === SortingOrder.ASCENDING) {
        // Ascending
        modifyQueryBasedOnResult = (result, builder) =>
          this.setParamBasedOnResult<T>('fromLocalTimestamp', result, builder)
      } else {
        // Descending
        modifyQueryBasedOnResult = (result, builder) =>
          this.setParamBasedOnResult<T>('toLocalTimestamp', result, builder)
      }
    } else {
      // We will use offset then
      reservedParams = new Map([['offset', ContentClient.CHARS_LEFT_FOR_OFFSET]])
      modifyQueryBasedOnResult = (result, queryBuilder) =>
        queryBuilder.setParam('offset', result.pagination.limit + result.pagination.offset)
    }

    yield* this.iterateThroughDeploymentsBasedOnResult<T>(
      queryParams,
      reservedParams,
      modifyQueryBasedOnResult,
      deploymentOptions?.errorListener,
      withSomeDefaults
    )
  }

  private async *iterateThroughDeploymentsBasedOnResult<
    T extends DeploymentBase = DeploymentWithMetadataContentAndPointers
  >(
    queryParams: Map<string, string[]>,
    reservedParams: Map<string, number>,
    modifyQueryBasedOnResult: (result: PartialDeploymentHistory<T>, builder: QueryBuilder) => void,
    errorListener?: (errorMessage: string) => void,
    options?: RequestOptions
  ): AsyncIterable<T> {
    // Split values into different queries
    const builders = splitValuesIntoManyQueryBuilders({
      baseUrl: this.contentUrl,
      path: '/deployments',
      queryParams,
      reservedParams
    })

    // Perform the different queries
    const foundIds: Set<EntityId> = new Set()
    let exit = false
    for (let i = 0; i < builders.length && !exit; i++) {
      const queryBuilder = builders[i]
      let keepRetrievingHistory = true
      while (keepRetrievingHistory && !exit) {
        const url = queryBuilder.toString()
        try {
          const partialHistory: PartialDeploymentHistory<T> = await this.fetcher.fetchJson(url, options)
          for (const deployment of partialHistory.deployments) {
            if (!foundIds.has(deployment.entityId)) {
              foundIds.add(deployment.entityId)
              yield deployment
            }
          }
          modifyQueryBasedOnResult(partialHistory, queryBuilder)
          keepRetrievingHistory = partialHistory.pagination.moreData
        } catch (error) {
          if (errorListener) {
            errorListener(`${error}`)
          }
          exit = true
        }
      }
    }
  }

  private setParamBasedOnResult<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    paramName: string,
    result: PartialDeploymentHistory<T>,
    builder: QueryBuilder
  ) {
    const lastDeployment = result.deployments[result.deployments.length - 1]
    if (lastDeployment) {
      // @ts-ignore
      builder.setParam(paramName, lastDeployment.auditInfo.localTimestamp)
    }
  }

  private assertFiltersAreSet(filters: DeploymentFilters | undefined) {
    const filtersAreSet =
      filters?.from ||
      filters?.to ||
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

  private constructor(private readonly fields: string[]) { }

  getFields(): string {
    return this.fields.join(',')
  }

  isFieldIncluded(name: string) {
    return this.fields.includes(name)
  }
}
