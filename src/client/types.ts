import { AuthChain, EntityType } from '@dcl/schemas'
import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

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

export type ParallelConfig = {
  urls: string[]
}

export type ClientOptions = {
  url: string
  fetcher: IFetchComponent
  logger?: ILoggerComponent.ILogger
  /**
   * When set, the client will fetch entities from the given urls in parallel
   * and return the first successful response.
   * @type {ParallelConfig}
   */
  parallelConfig?: ParallelConfig
}
