import { AuthChain  } from 'dcl-crypto'
import { Hashing, Timestamp, buildEntityAndFile, EntityType, Pointer, ContentFile, EntityContentItemReference, EntityMetadata, ContentFileHash, EntityId, Fetcher } from 'dcl-catalyst-commons';


export class DeploymentBuilder {

    /**
     * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
     * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
     */
    static async buildEntity(type: EntityType, pointers: Pointer[], files: Map<string, Buffer> = new Map(), metadata?: EntityMetadata, timestamp?: Timestamp): Promise<DeploymentPreparationData> {
        // Make sure that there is at least one pointer
        DeploymentBuilder.assertThereIsAtLeastOnePointer(pointers)

        // Reorder input
        const contentFiles: ContentFile[] = Array.from(files.entries())
            .map(([name, content]) => ({ name, content }))

        // Calculate hashes
        const hashes = await Hashing.calculateHashes(contentFiles)
        const entityContent: EntityContentItemReference[] = hashes.map(({ hash, file }) => ({ file: file.name, hash }))

        // Calculate timestamp if necessary
        timestamp = timestamp ?? await DeploymentBuilder.calculateTimestamp()

        // Build entity file
        const { entity, entityFile } = await buildEntityAndFile(type, pointers, timestamp, entityContent, metadata)

        // Add entity file to content files
        hashes.push({ hash: entity.id, file: entityFile })

        // Group files by hash, to avoid sending the same file twice
        const filesByHash: Map<ContentFileHash, ContentFile> = new Map(hashes.map(({ hash, file }) =>  [hash, file]))

        return { files: filesByHash, entityId: entity.id }
    }

    /**
     * In cases where we don't need to re-upload content files, we can simply generate the generate the new entity
     */
    static async buildEntityWithAlreadyUploadedHashes(type: EntityType, pointers: Pointer[], content: Map<string, ContentFileHash>, metadata?: EntityMetadata, timestamp?: Timestamp): Promise<DeploymentPreparationData> {
        // Make sure that there is at least one pointer
        DeploymentBuilder.assertThereIsAtLeastOnePointer(pointers)

        // Re-organize the hashes
        const entityContent: EntityContentItemReference[] = Array.from(content.entries()).map(([file, hash]) => ({ file, hash }))

        // Calculate timestamp if necessary.
        timestamp = timestamp ?? await DeploymentBuilder.calculateTimestamp()

        // Build entity file
        const { entity, entityFile } = await buildEntityAndFile(type, pointers, timestamp, entityContent, metadata)

        return { files: new Map([[ entity.id, entityFile ]]), entityId: entity.id }
    }

    private static assertThereIsAtLeastOnePointer(pointers: Pointer[]): void {
        if (pointers.length === 0) {
            throw new Error(`All entities must have at least one pointer.`)
        }
    }

    private static async calculateTimestamp(): Promise<Timestamp> {
        // We will try to use a global time API, so if the local PC clock is off, it will still work
        const fetcher = new Fetcher()
        try {
            const { datetime } = await fetcher.fetchJson('https://worldtimeapi.org/api/timezone/Etc/UTC')
            return new Date(datetime).getTime()
        } catch (e) {
            return Date.now()
        }
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
