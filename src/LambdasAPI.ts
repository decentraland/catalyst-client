import { EthAddress } from 'dcl-crypto'
import { EntityMetadata, Profile, RequestOptions, ServerMetadata } from 'dcl-catalyst-commons'

export interface LambdasAPI {
  fetchProfiles(
    ethAddresses: EthAddress[],
    profileOptions?: ProfileOptions,
    options?: RequestOptions
  ): Promise<Profile[]>

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<EntityMetadata[]>

  fetchOwnedWearables<B extends boolean>(
    ethAddress: EthAddress,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>>

  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]>

  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }>

  getLambdasUrl(): string
}

export type ProfileOptions = {
  fields?: ProfileFields
}
export class ProfileFields {
  static readonly ONLY_SNAPSHOTS = new ProfileFields(['snapshots'])

  private constructor(private readonly fields: string[]) {}

  getFields(): string {
    return this.fields.join(',')
  }
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
