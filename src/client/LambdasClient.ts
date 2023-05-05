import {
  convertFiltersToQueryParams,
  mergeRequestOptions,
  sanitizeUrl,
  splitAndFetch,
  splitAndFetchPaginated
} from './utils/Helper'

import { RequestOptions } from '@well-known-components/interfaces'
import {
  ClientOptions,
  EmotesFilters,
  OwnedItems,
  OwnedItemsWithDefinition,
  OwnedItemsWithoutDefinition,
  ServerMetadata,
  WearablesFilters
} from './types'
import { withDefaultHeadersInjection } from './utils/fetcher'

export type LambdasClient = {
  fetchProfiles(ethAddresses: string[], options?: RequestOptions): Promise<any[]>
  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]>
  fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>>
  fetchOwnedThirdPartyWearables<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>>
  fetchEmotes(filters: EmotesFilters, options?: RequestOptions): Promise<any[]>
  fetchOwnedEmotes<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>>
  fetchOwnedThirdPartyEmotes<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>>
  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]>
  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }>
}

export function createLambdasClient(options: ClientOptions): LambdasClient {
  const lambdasUrl = sanitizeUrl(options.url)
  const fetcher = withDefaultHeadersInjection(options.fetcher)

  async function fetchProfiles(ethAddresses: string[], options?: RequestOptions): Promise<any[]> {
    if (ethAddresses.length === 0) {
      return Promise.resolve([])
    }

    const requestOptions = mergeRequestOptions(options ? options : {}, {
      body: JSON.stringify({ ids: ethAddresses }),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    return (await fetcher.fetch(`${lambdasUrl}/profiles`, requestOptions)).json()
  }

  function fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: fetcher,
      options,
      baseUrl: lambdasUrl,
      path: '/collections/wearables',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'wearables'
    })
  }

  function fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      baseUrl: lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] },
      fetcher,
      options
    })
  }

  function fetchOwnedThirdPartyWearables<B extends boolean>(
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
      fetcher,
      options,
      baseUrl: lambdasUrl,
      path: `/collections/wearables-by-owner/${ethAddress}`,
      queryParams
    })
  }

  function fetchEmotes(filters: EmotesFilters, options?: RequestOptions): Promise<any[]> {
    const queryParams = convertFiltersToQueryParams(filters)
    if (queryParams.size === 0) {
      throw new Error('You must set at least one filter')
    }

    return splitAndFetchPaginated({
      fetcher: fetcher,
      options,
      baseUrl: lambdasUrl,
      path: '/collections/emotes',
      queryParams,
      uniqueBy: 'id',
      elementsProperty: 'emotes'
    })
  }

  function fetchOwnedEmotes<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return splitAndFetch<B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition>({
      fetcher: fetcher,
      options,
      baseUrl: lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams: { name: 'includeDefinitions', values: [`${includeDefinitions}`] }
    })
  }

  function fetchOwnedThirdPartyEmotes<B extends boolean>(
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
      fetcher: fetcher,
      options,
      baseUrl: lambdasUrl,
      path: `/collections/emotes-by-owner/${ethAddress}`,
      queryParams
    })
  }

  async function fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]> {
    const result = await fetcher.fetch(`${lambdasUrl}/contracts/servers`, options)
    return result.json()
  }

  async function fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }> {
    const result = await fetcher.fetch(`${lambdasUrl}/status`, options)
    return result.json()
  }

  return {
    fetchProfiles,
    fetchWearables,
    fetchOwnedWearables,
    fetchOwnedThirdPartyWearables,
    fetchEmotes,
    fetchOwnedEmotes,
    fetchOwnedThirdPartyEmotes,
    fetchCatalystsApprovedByDAO,
    fetchLambdasStatus
  }
}
