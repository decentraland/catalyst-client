require('isomorphic-form-data')
import {
  Timestamp,
  Pointer,
  EntityType,
  Entity,
  EntityId,
  ServerStatus,
  ServerName,
  ContentFileHash,
  PartialDeploymentHistory,
  applySomeDefaults,
  retry,
  Fetcher,
  Hashing,
  LegacyPartialDeploymentHistory,
  DeploymentFilters,
  Deployment,
  AvailableContentResult,
  LegacyDeploymentHistory,
  DeploymentBase,
  DeploymentWithAuditInfo,
  LegacyAuditInfo,
  DeploymentSorting
} from 'dcl-catalyst-commons'
import asyncToArray from 'async-iterator-to-array'
import { Readable } from 'stream'
import merge from 'deepmerge'
import { ContentAPI, DeploymentWithMetadataContentAndPointers } from './ContentAPI'
import {
  addModelToFormData,
  sanitizeUrl,
  splitManyValuesIntoManyQueries,
  splitValuesIntoManyQueries
} from './utils/Helper'
import { DeploymentData } from './utils/DeploymentBuilder'
import { RequestOptions } from 'dcl-catalyst-commons/dist/utils/FetcherConfiguration'

export class ContentClient implements ContentAPI {
  private static readonly CHARS_LEFT_FOR_OFFSET = 7
  private readonly contentUrl: string

  constructor(
    contentUrl: string,
    private readonly origin: string, // The name or a description of the app that is using the client
    private readonly fetcher: Fetcher = new Fetcher({ headers: { 'user-agent': 'ContentServer/v2' } })
  ) {
    this.contentUrl = sanitizeUrl(contentUrl)
  }

  async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
    const form = new FormData()
    form.append('entityId', deployData.entityId)
    addModelToFormData(deployData.authChain, form, 'authChain')

    const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
    for (const [fileHash, file] of deployData.files) {
      if (!alreadyUploadedHashes.has(fileHash) || fileHash === deployData.entityId) {
        if (typeof window === 'undefined') {
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

    const requestOptions = merge(options ?? {}, {
      url: `${this.contentUrl}/entities${fix ? '?fix=true' : ''}`,
      body: form,
      headers: { 'x-upload-origin': this.origin }
    })

    const { creationTimestamp } = await this.fetcher.postForm(requestOptions)
    return creationTimestamp
  }

  fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
    if (pointers.length === 0) {
      return Promise.reject(`You must set at least one pointer.`)
    }

    return this.splitAndFetch<Entity, EntityId>(`/entities/${type}`, 'pointer', pointers, ({ id }) => id, options)
  }

  fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
    if (ids.length === 0) {
      return Promise.reject(`You must set at least one id.`)
    }

    return this.splitAndFetch<Entity, EntityId>(`/entities/${type}`, 'id', ids, ({ id }) => id, options)
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

  async fetchFullHistory(
    query?: { from?: number; to?: number; serverName?: string },
    options?: RequestOptions
  ): Promise<LegacyDeploymentHistory> {
    // We are setting different defaults in this case, because if one of the request fails, then all fail
    const withSomeDefaults = merge({ attempts: 3, waitTime: '1s' }, options ?? {})

    const events: LegacyDeploymentHistory = []
    let offset = 0
    let keepRetrievingHistory = true
    while (keepRetrievingHistory) {
      const currentQuery = { ...query, offset }
      const partialHistory: LegacyPartialDeploymentHistory = await this.fetchHistory(currentQuery, withSomeDefaults)
      events.push(...partialHistory.events)
      offset = partialHistory.pagination.offset + partialHistory.pagination.limit
      keepRetrievingHistory = partialHistory.pagination.moreData
    }

    return events
  }

  fetchHistory(
    query?: { from?: Timestamp; to?: Timestamp; serverName?: ServerName; offset?: number; limit?: number },
    options?: Partial<RequestOptions>
  ): Promise<LegacyPartialDeploymentHistory> {
    let path = `/history?offset=${query?.offset ?? 0}`
    if (query?.from) {
      path += `&from=${query?.from}`
    }
    if (query?.to) {
      path += `&to=${query?.to}`
    }
    if (query?.serverName) {
      path += `&serverName=${query?.serverName}`
    }
    if (query?.limit) {
      path += `&limit=${query?.limit}`
    }
    return this.fetchJson(path, options)
  }

  fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.fetchJson('/status', options)
  }

  async downloadContent(contentHash: ContentFileHash, options?: Partial<RequestOptions>): Promise<Buffer> {
    const { attempts = 3, waitTime = '0.5s' } = options ?? {}
    const timeout = options?.timeout ? { timeout: options.timeout } : {}

    return retry(
      async () => {
        const content = await this.fetcher.fetchBuffer({
          ...timeout,
          url: `${this.contentUrl}/contents/${contentHash}`
        })
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

  /**
   * This method fetches all deployments that match the given filters. It is important to mention, that if there are too many filters, then the
   * URL might get too long. In that case, we will internally make the necessary requests, but then the order of the deployments is not guaranteed.
   */
  fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]> {
    return asyncToArray(this.iterateThroughDeployments(deploymentOptions, options))
  }

  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
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
    const filterQueryParams: Map<string, string[]> = this.filtersToQueryParams(deploymentOptions?.filters)

    // Transform sorting object into query params map
    const sortingQueryParams = this.sortingToQueryParams(deploymentOptions?.sortBy)

    // Initialize query params with filters and sorting
    const queryParams = new Map([...filterQueryParams, ...sortingQueryParams])

    if (deploymentOptions?.fields) {
      const fieldsValue = deploymentOptions?.fields.getFields()
      queryParams.set('fields', [fieldsValue])

      // TODO: Remove on next deployment
      if (fieldsValue.includes('auditInfo')) {
        queryParams.set('showAudit', ['true'])
      }
    }

    // Reserve a few chars to send the offset
    const reservedChars = `&offset=`.length + ContentClient.CHARS_LEFT_FOR_OFFSET

    // Split values into different queries
    const queries = splitManyValuesIntoManyQueries(this.contentUrl, '/deployments', queryParams, reservedChars)

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
          const partialHistory: PartialDeploymentHistory<T> = await this.fetcher.fetchJson(
            merge(withSomeDefaults, { url: url })
          )
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

  private filtersToQueryParams(filters?: DeploymentFilters): Map<string, string[]> {
    if (!filters) {
      return new Map()
    }
    const entries = Object.entries(filters).map<[string, string[]]>(([name, value]) => {
      const newName = name.endsWith('s') ? name.slice(0, -1) : name
      let newValues: string[]
      // Force coersion of number, boolean, or string into string
      if (Array.isArray(value)) {
        newValues = [...value].map((_) => `${_}`)
      } else {
        newValues = [`${value}`]
      }
      return [newName, newValues]
    })
    return new Map(entries)
  }

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
    if (cids.length === 0) {
      return Promise.reject(`You must set at least one cid.`)
    }

    return this.splitAndFetch<{ cid: ContentFileHash; available: boolean }, ContentFileHash>(
      `/available-content`,
      'cid',
      cids,
      ({ cid }) => cid,
      options
    )
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

  /**
   * This method performs one or more fetches to the content server, splitting into different queries to avoid exceeding the max length of urls
   */
  private async splitAndFetch<E, K>(
    basePath: string,
    queryParamName: string,
    values: string[],
    extractKey: (object: E) => K,
    options?: RequestOptions
  ): Promise<E[]> {
    // Split values into different queries
    const queries = splitValuesIntoManyQueries(this.contentUrl, basePath, queryParamName, values)

    // Perform the different queries
    const results: E[][] = []
    for (const query of queries) {
      const result = await this.fetcher.fetchJson(merge(options ?? {}, { url: query }))
      results.push(result)
    }

    // Flatten results
    const flattenedResult: E[] = results.reduce((accum, value) => accum.concat(value), [])

    // Group results by key, since there could be duplicates
    const groupedResults: Map<K, E> = new Map(flattenedResult.map((result) => [extractKey(result), result]))

    // Return results
    return Array.from(groupedResults.values())
  }

  private fetchJson(path: string, options?: Partial<RequestOptions>): Promise<any> {
    return this.fetcher.fetchJson(merge(options ?? {}, { url: `${this.contentUrl}${path}` }))
  }
}

export type DeploymentOptions<T> = {
  filters?: DeploymentFilters
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
