import { Fetcher, HealthStatus, RequestOptions } from 'dcl-catalyst-commons'
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
  sanitizeUrl,
  splitAndFetch,
  splitAndFetchPaginated
} from './utils/Helper'

// import { IFetchComponent } from '@well-known-components/http-server'
import { IFetchComponent } from '@well-known-components/http-server'
import * as nodeFetch from 'node-fetch'
import { createFetchComponent } from './utils'

export type LambdasClientOptions = {
  lambdasUrl: string
  fetcher?: Fetcher
  customFetcher?: IFetchComponent
}

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: Fetcher
  private readonly customFetcher: IFetchComponent

  constructor(options: LambdasClientOptions) {
    this.lambdasUrl = sanitizeUrl(options.lambdasUrl)
    this.fetcher = options.fetcher
      ? options.fetcher
      : new Fetcher({
          headers: getHeadersWithUserAgent('lambdas-client')
        })
    this.customFetcher = options.customFetcher ? options.customFetcher : createFetchComponent()
  }

  async fetchProfiles(ethAddresses: string[], options?: nodeFetch.RequestInit): Promise<any[]> {
    if (ethAddresses.length === 0) {
      return Promise.resolve([])
    }

    const requestOptions = {
      ...(options || {}),
      body: JSON.stringify({ ids: ethAddresses }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    }

    return (await this.customFetcher.fetch(`${this.lambdasUrl}/profiles`, requestOptions)).json()
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
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
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      options
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
      baseUrl: this.lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams,
      options
    })
  }

  fetchEmotes(filters: EmotesFilters, options?: RequestOptions): Promise<any[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: '/collections/emotes',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'emotes',
      options
    })
  }

  fetchOwnedEmotes<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: this.fetcher,
      baseUrl: this.lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      options
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
      baseUrl: this.lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams,
      options
    })
  }

  fetchCatalystsApprovedByDAO(options?: nodeFetch.RequestInit): Promise<ServerMetadata[]> {
    return this.customFetcher.fetch(`${this.lambdasUrl}/contracts/servers`, options).then((result) => result.json())
  }

  fetchLambdasStatus(options?: nodeFetch.RequestInit): Promise<{ contentServerUrl: string }> {
    return this.customFetcher.fetch(`${this.lambdasUrl}/status`, options).then((result) => result.json())
  }

  fetchPeerHealth(options?: nodeFetch.RequestInit): Promise<Record<string, HealthStatus>> {
    return this.customFetcher.fetch(`${this.lambdasUrl}/health`, options).then((result) => result.json())
  }

  getLambdasUrl(): string {
    return this.lambdasUrl
  }
}
