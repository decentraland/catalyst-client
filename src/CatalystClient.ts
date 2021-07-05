import { EthAddress } from 'dcl-crypto'
import {
  Timestamp,
  Pointer,
  EntityType,
  Entity,
  EntityId,
  ServerStatus,
  ContentFileHash,
  Profile,
  Fetcher,
  AvailableContentResult,
  DeploymentBase,
  LegacyAuditInfo,
  RequestOptions,
  ServerMetadata,
  HealthStatus
} from 'dcl-catalyst-commons'
import { Readable } from 'stream'
import { CatalystAPI } from './CatalystAPI'
import { DeploymentBuilder, DeploymentData, DeploymentPreparationData } from './utils/DeploymentBuilder'
import { getHeadersWithUserAgent, sanitizeUrl } from './utils/Helper'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions, ContentClient, DeploymentOptions } from './ContentClient'
import { LambdasClient } from './LambdasClient'
import { DeploymentWithMetadataContentAndPointers } from './ContentAPI'
import { WearablesFilters, OwnedWearables, ProfileOptions } from './LambdasAPI'
import { clientConnectedToCatalystIn } from './utils/CatalystClientBuilder'
import { PROOF_OF_WORK } from './utils'
import { obtainJWT, removedJWTCookie } from './ports/Jwt'

export class CatalystClient implements CatalystAPI {
  private readonly contentClient: ContentClient
  private readonly lambdasClient: LambdasClient
  private readonly catalystUrl: string

  constructor(
    catalystUrl: string,
    origin: string, // The name or a description of the app that is using the client
    fetcher: Fetcher = new Fetcher({ headers: getHeadersWithUserAgent('catalyst-client') }),
    deploymentBuilderClass?: typeof DeploymentBuilder
  ) {
    this.catalystUrl = sanitizeUrl(catalystUrl)
    this.contentClient = new ContentClient(this.catalystUrl + '/content', origin, fetcher, deploymentBuilderClass)
    this.lambdasClient = new LambdasClient(this.catalystUrl + '/lambdas', fetcher)
    if (PROOF_OF_WORK) {
      setImmediate(async () => {
        const jwt = await obtainJWT(fetcher, this.catalystUrl)
        fetcher.overrideDefaults({ cookies: { JWT: jwt } })
        fetcher.overrideSetImmediate(async (response: Response) => {
          if (removedJWTCookie(response)) {
            const jwt = await obtainJWT(fetcher, this.catalystUrl)
            fetcher.overrideDefaults({ cookies: { JWT: jwt } })
          }
        })
      })
    }
  }

  async buildEntity({ type, pointers, files, metadata }: BuildEntityOptions): Promise<DeploymentPreparationData> {
    return this.contentClient.buildEntity({ type, pointers, files, metadata })
  }

  async buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    return this.contentClient.buildEntityWithoutNewFiles({ type, pointers, hashesByKey, metadata })
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

  fetchContentStatus(options?: RequestOptions): Promise<ServerStatus> {
    return this.contentClient.fetchContentStatus(options)
  }

  fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]> {
    return this.contentClient.fetchAllDeployments(deploymentOptions, options)
  }

  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions: DeploymentOptions<T>,
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

  fetchProfiles(
    ethAddresses: EthAddress[],
    profileOptions?: ProfileOptions,
    options?: RequestOptions
  ): Promise<Profile[]> {
    return this.lambdasClient.fetchProfiles(ethAddresses, profileOptions, options)
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

  public static connectedToCatalystIn(network: 'mainnet' | 'ropsten', origin: string): Promise<CatalystClient> {
    return clientConnectedToCatalystIn(network, origin)
  }
}
