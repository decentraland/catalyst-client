import { AuthChain } from 'dcl-crypto'
import { EntityMetadata, EntityType, Pointer, EntityContent, ContentFile, EntityId, ContentFileHash } from "../../../catalyst-commons/src/types";
import { buildEntityAndFile } from "../../../catalyst-commons/src/utils/EntityFactory";
import { Hashing } from "../../../catalyst-commons/src/utils/Hashing";


export class DeploymentBuilder {


    /**
     * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
     * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
     */
    static async buildEntity(type: EntityType, pointers: Pointer[], files: Map<string, Buffer> = new Map(), metadata?: EntityMetadata): Promise<DeploymentPreparationData> {
        // Reorder input
        const contentFiles: ContentFile[] = Array.from(files.entries())
            .map(([name, content]) => ({ name, content }))

        // Calculate hashes
        const hashes = await Hashing.calculateHashes(contentFiles)
        const entityContent: EntityContent[] = Array.from(hashes.entries())
            .map(([hash, { name }]) => ({ file: name, hash }))

        // Build entity file
        const { entity, entityFile } = await buildEntityAndFile(type, pointers, Date.now(), entityContent, metadata)

        // Add entity file to content files
        hashes.set(entity.id, entityFile)

        return { files: hashes, entityId: entity.id }
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
