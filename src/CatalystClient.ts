import { EthAddress } from 'dcl-crypto'
import {
  Timestamp,
  Pointer,
  EntityType,
  Entity,
  EntityId,
  ServerStatus,
  ServerName,
  ContentFileHash,
  Profile,
  Fetcher,
  LegacyPartialDeploymentHistory,
  LegacyDeploymentHistory,
  AvailableContentResult,
  DeploymentBase,
  LegacyAuditInfo,
  RequestOptions
} from 'dcl-catalyst-commons'
import { Readable } from 'stream'
import { CatalystAPI } from './CatalystAPI'
import { DeploymentData } from './utils/DeploymentBuilder'
import { sanitizeUrl } from './utils/Helper'
import { ContentClient, DeploymentOptions } from './ContentClient'
import { LambdasClient } from './LambdasClient'
import { DeploymentWithMetadataContentAndPointers } from './ContentAPI'
import { RUNNING_VERSION } from './utils/Environment'
import { WearablesFilters, OwnedWearables } from './LambdasAPI'

export class CatalystClient implements CatalystAPI {
  private readonly contentClient: ContentClient
  private readonly lambdasClient: LambdasClient

  constructor(
    catalystUrl: string,
    origin: string, // The name or a description of the app that is using the client
    fetcher?: Fetcher
  ) {
    catalystUrl = sanitizeUrl(catalystUrl)
    fetcher =
      fetcher ??
      new Fetcher({
        headers: {
          'User-Agent': `catalyst-client/${RUNNING_VERSION} (+https://github.com/decentraland/catalyst-client)`
        }
      })
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

  fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<LegacyAuditInfo> {
    return this.contentClient.fetchAuditInfo(type, id, options)
  }

  fetchFullHistory(
    query?: { from?: number; to?: number; serverName?: string },
    options?: RequestOptions
  ): Promise<LegacyDeploymentHistory> {
    return this.contentClient.fetchFullHistory(query, options)
  }

  fetchHistory(
    query?: { from?: Timestamp; to?: Timestamp; serverName?: ServerName; offset?: number; limit?: number },
    options?: RequestOptions
  ): Promise<LegacyPartialDeploymentHistory> {
    return this.contentClient.fetchHistory(query, options)
  }

  fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.contentClient.fetchStatus(options)
  }

  fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]> {
    return this.contentClient.fetchAllDeployments(deploymentOptions, options)
  }

  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
    options?: RequestOptions
  ): Readable {
    return this.contentClient.streamAllDeployments(deploymentOptions, options)
  }

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
    return this.contentClient.isContentAvailable(cids, options)
  }

  downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer> {
    return this.contentClient.downloadContent(contentHash, options)
  }

  pipeContent(
    contentHash: ContentFileHash,
    writeTo: ReadableStream<Uint8Array>,
    options?: RequestOptions
  ): Promise<Map<string, string>> {
    return this.contentClient.pipeContent(contentHash, writeTo, options)
  }

  fetchProfiles(ethAddresses: EthAddress[], options?: RequestOptions): Promise<Profile[]> {
    return this.lambdasClient.fetchProfiles(ethAddresses, options)
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
    return this.lambdasClient.fetchWearables(filters, options)
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: EthAddress,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>> {
    return this.lambdasClient.fetchOwnedWearables(ethAddress, includeDefinitions, options)
  }
}
