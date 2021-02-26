import { EthAddress } from 'dcl-crypto'
import { EntityMetadata, Profile, RequestOptions } from 'dcl-catalyst-commons'

export interface LambdasAPI {
  /** Retrieve / Download */
  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile>

  fetchProfiles(ethAddresses: EthAddress[], options?: RequestOptions): Promise<Profile[]>

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<EntityMetadata[]>

  fetchOwnedWearables<B extends boolean>(
    ethAddress: EthAddress,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>>
}

export type WearablesFilters = {
  collectionIds?: string[]
  wearableIds?: string[]
  textSearch?: string
}

export type OwnedWearables<B extends boolean> = (B extends false
  ? OwnedWearablesWithoutDefinition
  : OwnedWearablesWithDefinition)[]

export type OwnedWearablesWithDefinition = OwnedWearablesWithoutDefinition & { definition: EntityMetadata }

export type OwnedWearablesWithoutDefinition = {
  urn: string
  amount: number
}
