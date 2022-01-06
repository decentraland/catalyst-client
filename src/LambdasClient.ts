import { EntityMetadata, Fetcher, HealthStatus, Profile, RequestOptions, ServerMetadata } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import {
  LambdasAPI,
  OwnedWearables,
  OwnedWearablesWithDefinition,
  OwnedWearablesWithoutDefinition,
  ProfileOptions,
  WearablesFilters
} from './LambdasAPI'
import {
  convertFiltersToQueryParams,
  getHeadersWithUserAgent,
  sanitizeUrl,
  splitAndFetch,
  splitAndFetchPaginated
} from './utils/Helper'

export type LambdasClientOptions = {
  lambdasUrl: string
  fetcher?: Fetcher
}
export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: Fetcher

  constructor(options: LambdasClientOptions) {
    this.lambdasUrl = sanitizeUrl(options.lambdasUrl)
    this.fetcher =
      options.fetcher ??
      new Fetcher({
        headers: getHeadersWithUserAgent('lambdas-client')
      })
  }

  fetchProfiles(
    ethAddresses: EthAddress[],
    profileOptions?: ProfileOptions,
    options?: RequestOptions
  ): Promise<Profile[]> {
    const queryParams: Map<string, string[]> = new Map()
    queryParams.set('id', ethAddresses)
    if (profileOptions?.fields) {
      const fieldsValue = profileOptions?.fields.getFields()
      queryParams.set('fields', [fieldsValue])
    }

    if (profileOptions?.versions) {
      queryParams.set('version', profileOptions.versions.map(it => it.toString(10)))
    }

    return splitAndFetch<Profile>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: '/profiles',
      queryParams,
      options
    })
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<EntityMetadata[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: '/collections/wearables',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'wearables',
      options
    })
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: EthAddress,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>> {
    return splitAndFetch<B extends false ? OwnedWearablesWithoutDefinition : OwnedWearablesWithDefinition>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      options
    })
  }

  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/contracts/servers`, options) as any
  }

  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/status`, options) as any
  }

  fetchPeerHealth(options?: RequestOptions): Promise<Record<string, HealthStatus>> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/health`, options) as any
  }

  getLambdasUrl(): string {
    return this.lambdasUrl
  }
}
