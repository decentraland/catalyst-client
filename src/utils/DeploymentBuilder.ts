import { AuthChain } from 'dcl-crypto'
import { EntityMetadata, EntityType, Pointer, EntityContentItemReference, ContentFile, EntityId, ContentFileHash } from "../catalyst-commons/types";
import { buildEntityAndFile } from "../catalyst-commons/utils/EntityFactory";
import { Hashing } from "../catalyst-commons/utils/Hashing";


export class DeploymentBuilder {

    /**
     * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
     * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
     */
    static async buildEntity(type: EntityType, pointers: Pointer[], files: Map<string, Buffer> = new Map(), metadata?: EntityMetadata): Promise<DeploymentPreparationData> {
        // Make sure that there is at least one pointer
        if (pointers.length === 0) {
            throw new Error(`All entities must have at least one pointer.`)
        }

        // Reorder input
        const contentFiles: ContentFile[] = Array.from(files.entries())
            .map(([name, content]) => ({ name, content }))

        // Calculate hashes
        const hashes = await Hashing.calculateHashes(contentFiles)
        const entityContent: EntityContentItemReference[] = hashes.map(({ hash, file }) => ({ file: file.name, hash }))

        // Build entity file
        const { entity, entityFile } = await buildEntityAndFile(type, pointers, Date.now(), entityContent, metadata)

        // Add entity file to content files
        hashes.push({ hash: entity.id, file: entityFile })

        // Group files by hash, to avoid sending the same file twice
        const filesByHash: Map<ContentFileHash, ContentFile> = new Map(hashes.map(({ hash, file }) =>  [hash, file]))

        return { files: filesByHash, entityId: entity.id }
    }

}

/** This data contains everything necessary for the user to sign, so that then a deployment can be executed */
export type DeploymentPreparationData = {
    entityId: EntityId,
    files: Map<ContentFileHash, ContentFile>,
}


export type DeploymentData = DeploymentPreparationData & {
    authChain: AuthChain,
}
