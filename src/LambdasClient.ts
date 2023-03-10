import { HealthStatus } from 'dcl-catalyst-commons'
import {
  EmotesFilters,
  LambdasAPI,
  OwnedItems,
  OwnedItemsWithDefinition,
  OwnedItemsWithoutDefinition,
  ServerMetadata,
  WearablesFilters
} from './LambdasAPI'
import {
  convertFiltersToQueryParams,
  getHeadersWithUserAgent,
  mergeRequestOptions,
  sanitizeUrl,
  splitAndFetch,
  splitAndFetchPaginated
} from './utils/Helper'

import { IFetchComponent, RequestOptions, createFetchComponent } from './utils'

export type LambdasClientOptions = {
  lambdasUrl: string
  fetcher?: IFetchComponent
}

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: IFetchComponent

  constructor(options: LambdasClientOptions) {
    this.lambdasUrl = sanitizeUrl(options.lambdasUrl)
    this.fetcher = options.fetcher
      ? options.fetcher
      : createFetchComponent({ headers: getHeadersWithUserAgent('lambdas-client') })
  }

  async fetchProfiles(ethAddresses: string[], options?: RequestOptions): Promise<any[]> {
    if (ethAddresses.length === 0) {
      return Promise.resolve([])
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ ids: ethAddresses }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    return (await this.fetcher.fetch(`${this.lambdasUrl}/profiles`, requestOptions)).json()
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: this.fetcher,
      options,
      baseUrl: this.lambdasUrl,
      path: '/collections/wearables',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'wearables'
    })
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      fetcher: this.fetcher,
      options: options
    })
  }

  fetchOwnedThirdPartyWearables<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    const queryParams = new Map([
      ['collectionId', [thirdPartyId]],
      ['includeDefinitions', [`${includeDefinitions}`]]
    ])
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: this.fetcher,
      options,
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams
    })
  }

  fetchEmotes(filters: EmotesFilters, options?: RequestOptions): Promise<any[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: this.fetcher,
      options,
      baseUrl: this.lambdasUrl,
      path: '/collections/emotes',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'emotes'
    })
  }

  fetchOwnedEmotes<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: this.fetcher,
      options,
      baseUrl: this.lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] }
    })
  }

  fetchOwnedThirdPartyEmotes<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    const queryParams = new Map([
      ['collectionId', [thirdPartyId]],
      ['includeDefinitions', [`${includeDefinitions}`]]
    ])
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: this.fetcher,
      options,
      baseUrl: this.lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams
    })
  }

  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]> {
    return this.fetcher.fetch(`${this.lambdasUrl}/contracts/servers`, options).then((result) => result.json())
  }

  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }> {
    return this.fetcher.fetch(`${this.lambdasUrl}/status`, options).then((result) => result.json())
  }

  fetchPeerHealth(options?: RequestOptions): Promise<Record<string, HealthStatus>> {
    return this.fetcher.fetch(`${this.lambdasUrl}/health`, options).then((result) => result.json())
  }

  getLambdasUrl(): string {
    return this.lambdasUrl
  }
}
