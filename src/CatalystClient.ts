import { EthAddress } from 'dcl-crypto'
import { Timestamp, Pointer, EntityType, Entity, EntityId, AuditInfo, ServerStatus, ServerName, ContentFileHash, DeploymentHistory, Profile, PartialDeploymentHistory, Fetcher, RequestOptions } from "dcl-catalyst-commons";
import { CatalystAPI } from "./CatalystAPI";
import { DeploymentData } from './utils/DeploymentBuilder';
import { sanitizeUrl } from './utils/Helper';
import { ContentClient } from './ContentClient';
import { LambdasClient } from './LambdasClient';

export class CatalystClient implements CatalystAPI {

    private readonly contentClient: ContentClient
    private readonly lambdasClient: LambdasClient

    constructor(catalystUrl: string,
        origin: string, // The name or a description of the app that is using the client
        fetcher: Fetcher = new Fetcher()) {
        catalystUrl = sanitizeUrl(catalystUrl)
        this.contentClient = new ContentClient(catalystUrl + '/content', origin, fetcher)
        this.lambdasClient = new LambdasClient(catalystUrl + '/lambdas', fetcher)
    }

    deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
       return this.contentClient.deployEntity(deployData, fix, options)
    }

    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
        return this.contentClient.fetchEntitiesByPointers(type, pointers, options)
    }

    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
        return this.contentClient.fetchEntitiesByIds(type, ids, options)
    }

    fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity> {
        return this.contentClient.fetchEntityById(type, id, options)
    }

    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo> {
        return this.contentClient.fetchAuditInfo(type, id, options)
    }

    fetchFullHistory(query?: { from?: number; to?: number; serverName?: string }, options?: RequestOptions): Promise<DeploymentHistory> {
        return this.contentClient.fetchFullHistory(query, options)
    }

    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number}, options?: RequestOptions): Promise<PartialDeploymentHistory> {
        return this.contentClient.fetchHistory(query, options)
    }

    fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
        return this.contentClient.fetchStatus(options)
    }

    downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer> {
        return this.contentClient.downloadContent(contentHash, options)
    }

    fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
        return this.lambdasClient.fetchProfile(ethAddress, options)
    }

}
