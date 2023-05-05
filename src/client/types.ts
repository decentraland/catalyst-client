import { AuthChain, EntityType } from '@dcl/schemas'
import { IFetchComponent } from '@well-known-components/interfaces'

export type DeploymentPreparationData = {
  entityId: string
  files: Map<string, Uint8Array>
}

export type DeploymentData = DeploymentPreparationData & {
  authChain: AuthChain
}

export type BuildEntityOptions = {
  type: EntityType
  pointers: string[]
  files?: Map<string, Uint8Array>
  metadata?: any
  timestamp?: number
}

export type BuildEntityWithoutFilesOptions = {
  type: EntityType
  pointers: string[]
  hashesByKey?: Map<string, string>
  metadata?: any
  timestamp?: number
}

export type ServerMetadata = {
  baseUrl: string
  owner: string
  id: string
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

export type ClientOptions = {
  url: string
  fetcher: IFetchComponent
}
