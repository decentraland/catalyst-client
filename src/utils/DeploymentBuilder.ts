import * as hashing from '@dcl/hashing'
import { hashV1 } from '@dcl/hashing'
import {
  ContentFileHash,
  Entity,
  EntityContentItemReference,
  EntityId,
  EntityMetadata,
  EntityType,
  EntityVersion,
  Pointer,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'

export class DeploymentBuilder {
  /**
   * Take all the entity's data, build the entity file with it, and calculate its id
   */
  static async buildEntityAndFile({
    version,
    type,
    pointers,
    timestamp,
    content,
    metadata
  }: {
    /** @deprecated version is nolonger required since ADR51 */
    version?: EntityVersion
    type: EntityType
    pointers: Pointer[]
    timestamp: Timestamp
    content?: EntityContentItemReference[]
    metadata?: EntityMetadata
  }): Promise<{ entity: Entity; entityFile: Uint8Array }> {
    // Make sure that there is at least one pointer
    if (pointers.length === 0) throw new Error(`All entities must have at least one pointer.`)

    if (version === EntityVersion.V2) throw new Error(`V2 is not supported.`)

    const entity = {
      // default version is V3
      version: version || EntityVersion.V3,
      type,
      pointers,
      timestamp,
      content,
      metadata
    }

    // prevent duplicated file names
    if (content) {
      const usedFilenames = new Set<string>()
      for (let a of content) {
        const lowerCasedFileName = a.file.toLowerCase()
        if (usedFilenames.has(lowerCasedFileName)) {
          throw new Error(
            `Error creating the deployable entity: Decentraland's file system is case insensitive, the file ${JSON.stringify(
              a.file
            )} is repeated`
          )
        }
        usedFilenames.add(lowerCasedFileName)
      }
    }

    const entityFile = new TextEncoder().encode(JSON.stringify(entity))

    const entityId: EntityId = await hashV1(entityFile)
    const entityWithId: Entity = {
      id: entityId,
      ...entity
    }

    return { entity: entityWithId, entityFile }
  }

  /**
   * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
   * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
   */
  static async buildEntity({
    version,
    type,
    pointers,
    files,
    metadata,
    timestamp
  }: {
    version: EntityVersion
    type: EntityType
    pointers: Pointer[]
    files?: Map<string, Uint8Array>
    metadata?: EntityMetadata
    timestamp?: Timestamp
  }): Promise<DeploymentPreparationData> {
    // Reorder input
    const contentFiles = Array.from(files ?? []).map(([key, content]) => ({
      key,
      content
    }))

    // Calculate hashes
    const allInfo = await Promise.all(
      contentFiles.map(async ({ key, content }) => ({ key, content, hash: await hashing.hashV1(content) }))
    )
    const hashesByKey: Map<string, ContentFileHash> = new Map(allInfo.map(({ hash, key }) => [key, hash]))
    const filesByHash: Map<ContentFileHash, Uint8Array> = new Map(allInfo.map(({ hash, content }) => [hash, content]))

    return DeploymentBuilder.buildEntityInternal(version, type, pointers, {
      hashesByKey,
      filesByHash,
      metadata,
      timestamp
    })
  }

  /**
   * In cases where we don't need upload content files, we can simply generate the new entity. We can still use already uploaded hashes on this new entity.
   */
  static async buildEntityWithoutNewFiles({
    version,
    type,
    pointers,
    hashesByKey,
    metadata,
    timestamp
  }: {
    version: EntityVersion
    type: EntityType
    pointers: Pointer[]
    hashesByKey?: Map<string, ContentFileHash>
    metadata?: EntityMetadata
    timestamp?: Timestamp
  }): Promise<DeploymentPreparationData> {
    return DeploymentBuilder.buildEntityInternal(version, type, pointers, { hashesByKey, metadata, timestamp })
  }

  private static async buildEntityInternal(
    version: EntityVersion,
    type: EntityType,
    pointers: Pointer[],
    options?: BuildEntityInternalOptions
  ): Promise<DeploymentPreparationData> {
    // Make sure that there is at least one pointer
    if (pointers.length === 0) {
      throw new Error(`All entities must have at least one pointer.`)
    }

    // Re-organize the hashes
    const hashesByKey: Map<string, ContentFileHash> = options?.hashesByKey ?? new Map()
    const entityContent: EntityContentItemReference[] = Array.from(hashesByKey.entries()).map(([key, hash]) => ({
      file: key,
      hash
    }))

    // Calculate timestamp if necessary
    const timestamp: Timestamp = options?.timestamp ?? Date.now()

    // Build entity file
    const { entity, entityFile } = await DeploymentBuilder.buildEntityAndFile({
      version,
      type,
      pointers,
      timestamp,
      content: entityContent,
      metadata: options?.metadata
    })

    // Add entity file to content files
    const filesByHash: Map<ContentFileHash, Uint8Array> = options?.filesByHash ?? new Map()
    filesByHash.set(entity.id, entityFile)

    return { files: filesByHash, entityId: entity.id }
  }
}

type BuildEntityInternalOptions = {
  hashesByKey?: Map<string, ContentFileHash>
  filesByHash?: Map<ContentFileHash, Uint8Array>
  metadata?: EntityMetadata
  timestamp?: Timestamp
}

/** This data contains everything necessary for the user to sign, so that then a deployment can be executed */
export type DeploymentPreparationData = {
  entityId: EntityId
  files: Map<ContentFileHash, Uint8Array>
}

export type DeploymentData = DeploymentPreparationData & {
  authChain: AuthChain
}
