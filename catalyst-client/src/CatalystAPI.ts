import { EthAddress } from 'dcl-crypto'
import { RequestOptions } from "../../catalyst-commons/src/utils/Fetcher";
import { EntityMetadata, Timestamp, ContentFileHash, ServerStatus, AuditInfo, EntityType, Pointer, EntityId, Entity, ServerName } from "../../catalyst-commons/src/types";
import { DeploymentData } from './utils/DeploymentBuilder';

export interface CatalystAPI {

    /** Retrieve / Download */
    getEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]>;
    getEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]>;
    getEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity | undefined>;
    getAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo>;
    getHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<DeploymentHistory>;
    getStatus(options?: RequestOptions): Promise<ServerStatus>;
    downloadContent(fileHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>;
    getProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<EntityMetadata>;

    /** Upload */
    deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>;

}