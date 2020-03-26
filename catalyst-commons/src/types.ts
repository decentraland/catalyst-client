
import { AuthChain } from 'dcl-crypto'

export type ContentFileHash = string
export type Timestamp = number
export type EntityId = ContentFileHash
export type Pointer = string
export type EntityMetadata = any

export type EntityContent = {
    file: string,
    hash: ContentFileHash,
}

export enum EntityType {
    SCENE = "scene",
    PROFILE = "profile",
}

export type Entity = {
    id: EntityId,
    type: EntityType,
    pointers: Pointer[],
    timestamp: Timestamp,
    content?: EntityContent[],
    metadata?: EntityMetadata,
}

export type ContentFile = {
    name: string
    content: Buffer
}

export type ServerVersion = string
export type ServerName = string

export type ServerStatus = {
    name: ServerName
    version: ServerVersion
    currentTime: Timestamp
    lastImmutableTime: Timestamp
    historySize: number
}

export type EntityVersion = string

export type AuditInfo = {
    version: EntityVersion,
    deployedTimestamp: Timestamp
    authChain: AuthChain,
    overwrittenBy?: EntityId,
    isDenylisted?: boolean,
    denylistedContent?: ContentFileHash[],
    originalMetadata?: { // This is used for migrations
        originalVersion: EntityVersion,
        data: any,
    },
}

export type DeploymentEvent = {
    /** The server where the user uploaded the entity */
    serverName: ServerName,
    entityType: EntityType,
    entityId: EntityId,
    /** The moment when the server validated and stored the entity */
    timestamp: Timestamp,
}

export type DeploymentHistory = DeploymentEvent[]