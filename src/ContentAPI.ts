import {
  AuditInfo,
  AvailableContentResult,
  ContentFileHash, DeploymentWithContent,
  DeploymentWithMetadata,
  DeploymentWithPointers,
  Entity,
  EntityId,
  EntityType,
  Pointer,
  RequestOptions,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import { Writable } from 'stream'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions } from './ContentClient'
import { DeploymentData, DeploymentPreparationData } from './utils/DeploymentBuilder'

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
  fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]>
  fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]>
  fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity>
  fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo>
  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus>
  downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>
  isContentAvailable(cids: ContentFileHash[], options?: RequestOptions): Promise<AvailableContentResult>

  /**
   * pipeContent only works in Node.js like environments
   */
  pipeContent(contentHash: ContentFileHash, writeTo: Writable, options?: RequestOptions): Promise<Map<string, string>>

  /** Upload */
  deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>

  /** Status */
  getContentUrl(): string
}

export type DeploymentWithMetadataContentAndPointers = DeploymentWithMetadata &
  DeploymentWithContent &
  DeploymentWithPointers
