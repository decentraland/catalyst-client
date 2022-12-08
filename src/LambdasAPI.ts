import { RequestOptions } from 'dcl-catalyst-commons'

export type ServerMetadata = {
  baseUrl: string
  owner: string
  id: string
}

export interface LambdasAPI {
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
  getLambdasUrl(): string
}

export type ItemFilters = {
  collectionIds?: string[]
  textSearch?: string
}

export type WearablesFilters = ItemFilters & {
  wearableIds?: string[]
}

export type EmotesFilters = ItemFilters & {
  emoteIds?: string[]
}

export type OwnedItems<B extends boolean> = (B extends false ? OwnedItemsWithoutDefinition : OwnedItemsWithDefinition)[]

export type OwnedItemsWithDefinition = OwnedItemsWithoutDefinition & { definition: any }

export type OwnedItemsWithoutDefinition = {
  urn: string
  amount: number
}
