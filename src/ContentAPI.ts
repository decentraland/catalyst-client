import { Timestamp, ContentFileHash, ServerStatus, AuditInfo, EntityType, Pointer, EntityId, Entity, ServerName, LegacyDeploymentHistory, LegacyPartialDeploymentHistory, RequestOptions, DeploymentFilters, PartialDeploymentHistory, AvailableContentResult, DeploymentBase, DeploymentWithMetadata, DeploymentWithContent, DeploymentWithPointers, Deployment } from "dcl-catalyst-commons";
import { DeploymentData } from './utils/DeploymentBuilder';
import { DeploymentFields } from "ContentClient";

export interface ContentAPI {

    /** Retrieve / Download */
    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity>;
    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo>;
    fetchFullHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<LegacyDeploymentHistory>;
    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number}, options?: RequestOptions): Promise<LegacyPartialDeploymentHistory>;
    fetchStatus(options?: RequestOptions): Promise<ServerStatus>;
    fetchAllDeployments<T extends DeploymentBase = Deployment>(filters?: DeploymentFilters, fields?: DeploymentFields<T>, options?: RequestOptions): Promise<T[]>;
    fetchLastDeployments<T extends DeploymentBase = DeploymentWithPointers & DeploymentWithContent & DeploymentWithMetadata>(offset?: number, limit?: number, fields?: DeploymentFields<T>, options?: RequestOptions): Promise<PartialDeploymentHistory<T>>;
    downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>;
    isContentAvailable(cids: ContentFileHash[], options?: RequestOptions): Promise<AvailableContentResult>

    /** Upload */
    deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>;

}