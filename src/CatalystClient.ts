import {
  AuditInfo,
  AvailableContentResult,
  ContentFileHash,
  Entity,
  EntityId,
  EntityType,
  Fetcher,
  HealthStatus,
  Pointer,
  Profile,
  RequestOptions,
  ServerMetadata,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import { Writable } from 'stream'
import { CatalystAPI } from './CatalystAPI'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions, ContentClient } from './ContentClient'
import { OwnedWearables, ProfileOptions, WearablesFilters } from './LambdasAPI'
import { LambdasClient } from './LambdasClient'
import { clientConnectedToCatalystIn } from './utils/CatalystClientBuilder'
import { DeploymentBuilder, DeploymentData, DeploymentPreparationData } from './utils/DeploymentBuilder'
import { getHeadersWithUserAgent, sanitizeUrl } from './utils/Helper'

export type CatalystClientOptions = {
  catalystUrl: string
  fetcher?: Fetcher
  deploymentBuilderClass?: typeof DeploymentBuilder
}
export class CatalystClient implements CatalystAPI {
  private readonly contentClient: ContentClient
  private readonly lambdasClient: LambdasClient
  private readonly catalystUrl: string

  constructor(options: CatalystClientOptions) {
    this.catalystUrl = sanitizeUrl(options.catalystUrl)
    const fetcher = options.fetcher
      ? options.fetcher
      : new Fetcher({
          headers: getHeadersWithUserAgent('catalyst-client')
        })
    this.contentClient = new ContentClient({
      contentUrl: this.catalystUrl + '/content',
      fetcher: fetcher,
      deploymentBuilderClass: options.deploymentBuilderClass
    })
    this.lambdasClient = new LambdasClient({
      lambdasUrl: this.catalystUrl + '/lambdas',
      fetcher: fetcher
    })
  }

  buildEntity(options: BuildEntityOptions): Promise<DeploymentPreparationData> {
    return this.contentClient.buildEntity(options)
  }

  buildEntityWithoutNewFiles(options: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    return this.contentClient.buildEntityWithoutNewFiles(options)
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

  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.contentClient.fetchContentStatus(options)
  }

  isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
    return this.contentClient.isContentAvailable(cids, options)
  }

  downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer> {
    return this.contentClient.downloadContent(contentHash, options)
  }

  pipeContent(contentHash: ContentFileHash, writeTo: Writable, options?: RequestOptions): Promise<Map<string, string>> {
    return this.contentClient.pipeContent(contentHash, writeTo, options)
  }

  fetchProfiles(
    ethAddresses: string[],
    profileOptions?: ProfileOptions,
    options?: RequestOptions
  ): Promise<Profile[]> {
    return this.lambdasClient.fetchProfiles(ethAddresses, profileOptions, options)
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
    return this.lambdasClient.fetchWearables(filters, options)
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>> {
    return this.lambdasClient.fetchOwnedWearables(ethAddress, includeDefinitions, options)
  }

  fetchOwnedThirdPartyWearables<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedWearables<B>> {
    return this.lambdasClient.fetchOwnedThirdPartyWearables(ethAddress, thirdPartyId, includeDefinitions, options)
  }

  fetchCatalystsApprovedByDAO(options?: RequestOptions): Promise<ServerMetadata[]> {
    return this.lambdasClient.fetchCatalystsApprovedByDAO(options)
  }

  fetchLambdasStatus(options?: RequestOptions): Promise<{ contentServerUrl: string }> {
    return this.lambdasClient.fetchLambdasStatus(options)
  }

  fetchPeerHealth(options?: RequestOptions): Promise<Record<string, HealthStatus>> {
    return this.lambdasClient.fetchPeerHealth(options)
  }

  getCatalystUrl(): string {
    return this.catalystUrl
  }

  getContentUrl(): string {
    return this.contentClient.getContentUrl()
  }

  getLambdasUrl(): string {
    return this.lambdasClient.getLambdasUrl()
  }

  public static connectedToCatalystIn(options: CatalystConnectOptions): Promise<CatalystClient> {
    return clientConnectedToCatalystIn(options)
  }
}

export type CatalystConnectOptions = {
  network: 'mainnet' | 'ropsten'
}
