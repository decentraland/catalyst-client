import { RequestOptions } from 'dcl-catalyst-commons'

export type ServerMetadata = {
  baseUrl: string
  owner: string
  id: string
}

export interface LambdasAPI {
  fetchProfiles(ethAddresses: string[], profileOptions?: ProfileOptions, options?: RequestOptions): Promise<any[]>
  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<EntityMetadata[]>
  fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>>
  fetchOwnedThirdPartyWearables<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>>
  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]>
  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }>
  getLambdasUrl(): string
}

export type ProfileOptions = {
  versions?: number[]
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
