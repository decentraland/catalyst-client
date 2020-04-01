import { Timestamp, ContentFileHash, ServerStatus, AuditInfo, EntityType, Pointer, EntityId, Entity, ServerName, Profile, DeploymentHistory, PartialDeploymentHistory, RequestOptions } from "dcl-catalyst-commons";
import { DeploymentData } from './utils/DeploymentBuilder';

export interface ContentAPI {

    /** Retrieve / Download */
    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity>;
    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo>;
    fetchFullHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<DeploymentHistory>;
    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<PartialDeploymentHistory>;
    fetchStatus(options?: RequestOptions): Promise<ServerStatus>;
    downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>;

    /** Upload */
    deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>;

}