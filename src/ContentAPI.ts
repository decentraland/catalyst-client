import {
  AvailableContentResult,
  ContentFileHash,
  DeploymentBase,
  DeploymentWithContent,
  DeploymentWithMetadata,
  DeploymentWithPointers,
  Entity,
  EntityId,
  EntityType,
  LegacyAuditInfo,
  Pointer,
  RequestOptions,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import { Readable } from 'stream'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions, DeploymentOptions } from './ContentClient'
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
  fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<LegacyAuditInfo>
  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus>
  fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]>
  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Readable
  downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>
  isContentAvailable(cids: ContentFileHash[], options?: RequestOptions): Promise<AvailableContentResult>
  pipeContent(
    contentHash: ContentFileHash,
    writeTo: ReadableStream<Uint8Array>,
    options?: RequestOptions
  ): Promise<Map<string, string>>

  /** Upload */
  deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>

  /** Status */
  getContentUrl(): string
}

export type DeploymentWithMetadataContentAndPointers = DeploymentWithMetadata &
  DeploymentWithContent &
  DeploymentWithPointers
