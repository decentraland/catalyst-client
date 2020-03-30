import { EthAddress } from 'dcl-crypto'
import { RequestOptions } from "./catalyst-commons/utils/Fetcher";
import { Timestamp, ContentFileHash, ServerStatus, AuditInfo, EntityType, Pointer, EntityId, Entity, ServerName, Profile, DeploymentHistory, PartialDeploymentHistory } from "./catalyst-commons/types";
import { DeploymentData } from './utils/DeploymentBuilder';

export interface CatalystAPI {

    /** Retrieve / Download */
    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]>;
    fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity>;
    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo>;
    fetchFullHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<DeploymentHistory>;
    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName}, options?: RequestOptions): Promise<PartialDeploymentHistory>;
    fetchStatus(options?: RequestOptions): Promise<ServerStatus>;
    fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile>;
    downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer>;

    /** Upload */
    deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp>;

}