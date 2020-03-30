import { ENTITY_FILE_NAME } from '../Constants'
import { EntityType, Pointer, Timestamp, EntityMetadata, Entity, EntityContentItemReference, ContentFile, EntityId } from "../types"
import { Hashing } from "./Hashing"

/**
 * Take all the entity's data, build the entity file with it, and calculate its id
 */
export async function buildEntityAndFile(type: EntityType, pointers: Pointer[], timestamp: Timestamp,
    content?: EntityContentItemReference[], metadata?: EntityMetadata): Promise<{entity: Entity, entityFile: ContentFile}> {

    // Make sure that there is at least one pointer
    if (pointers.length === 0) {
        throw new Error(`All entities must have at least one pointer.`)
    }

    const entity = {
        type,
        pointers,
        timestamp,
        content,
        metadata
    }

    const entityFile: ContentFile = { name: ENTITY_FILE_NAME, content: Buffer.from(JSON.stringify(entity)) }
    const entityId: EntityId = await Hashing.calculateHash(entityFile)
    const entityWithId: Entity = {
        id: entityId,
        ...entity
    }

    return { entity: entityWithId, entityFile}
}