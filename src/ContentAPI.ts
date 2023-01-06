import { AuthChain, Entity } from '@dcl/schemas'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions } from './ContentClient'
import { DeploymentData, DeploymentPreparationData, RequestOptions } from './utils'

export type AvailableContentResult = Array<{
  cid: string
  available: boolean
}>

export type EntityAuditInfoResponse = {
  localTimestamp: number
  authChain: AuthChain
}

export interface ContentAPI {
  /** Build entities */
  buildEntity({ type, pointers, files, metadata }: BuildEntityOptions): Promise<DeploymentPreparationData>
  buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData>

  /** Retrieve / Download */
  fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]>
  fetchEntityById(id: string, options?: RequestOptions): Promise<Entity>
  downloadContent(contentHash: string, options?: RequestOptions): Promise<Buffer>

  /** @deprecated use deploy instead */
  deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<number>

  /**
   * Deploys an entity to the content server.
   */
  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown>

  /** Status */
  getContentUrl(): string
}
