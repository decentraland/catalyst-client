import { Entity } from '@dcl/schemas'
import { Fetcher, HealthStatus, RequestOptions } from 'dcl-catalyst-commons'
import * as nodeFetch from 'node-fetch'
import { CatalystAPI } from './CatalystAPI'
import { BuildEntityOptions, BuildEntityWithoutFilesOptions, ContentClient } from './ContentClient'
import { EmotesFilters, OwnedItems, ServerMetadata, WearablesFilters } from './LambdasAPI'
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

  /** @deprecated use deploy instead */
  deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<number> {
    return this.contentClient.deployEntity(deployData, fix, options)
  }

  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    return this.contentClient.deploy(deployData, options)
  }

  fetchEntitiesByPointers(pointers: string[], options?: nodeFetch.RequestInit): Promise<Entity[]> {
    return this.contentClient.fetchEntitiesByPointers(pointers, options)
  }

  fetchEntitiesByIds(ids: string[], options?: nodeFetch.RequestInit): Promise<Entity[]> {
    return this.contentClient.fetchEntitiesByIds(ids, options)
  }

  fetchEntityById(id: string, options?: nodeFetch.RequestInit): Promise<Entity> {
    return this.contentClient.fetchEntityById(id, options)
  }

  downloadContent(contentHash: string, options?: RequestOptions): Promise<Buffer> {
    return this.contentClient.downloadContent(contentHash, options)
  }

  fetchProfiles(ethAddresses: string[], options?: nodeFetch.RequestInit): Promise<any[]> {
    return this.lambdasClient.fetchProfiles(ethAddresses, options)
  }

  fetchWearables(filters: WearablesFilters, options?: RequestOptions): Promise<any[]> {
    return this.lambdasClient.fetchWearables(filters, options)
  }

  fetchOwnedWearables<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return this.lambdasClient.fetchOwnedWearables(ethAddress, includeDefinitions, options)
  }

  fetchOwnedThirdPartyWearables<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return this.lambdasClient.fetchOwnedThirdPartyWearables(ethAddress, thirdPartyId, includeDefinitions, options)
  }

  fetchEmotes(filters: EmotesFilters, options?: RequestOptions): Promise<any[]> {
    return this.lambdasClient.fetchEmotes(filters, options)
  }

  fetchOwnedEmotes<B extends boolean>(
    ethAddress: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return this.lambdasClient.fetchOwnedEmotes(ethAddress, includeDefinitions, options)
  }

  fetchOwnedThirdPartyEmotes<B extends boolean>(
    ethAddress: string,
    thirdPartyId: string,
    includeDefinitions: B,
    options?: RequestOptions
  ): Promise<OwnedItems<B>> {
    return this.lambdasClient.fetchOwnedThirdPartyEmotes(ethAddress, thirdPartyId, includeDefinitions, options)
  }

  fetchCatalystsApprovedByDAO(options?: nodeFetch.RequestInit): Promise<ServerMetadata[]> {
    return this.lambdasClient.fetchCatalystsApprovedByDAO(options)
  }

  fetchLambdasStatus(options?: nodeFetch.RequestInit): Promise<{ contentServerUrl: string }> {
    return this.lambdasClient.fetchLambdasStatus(options)
  }

  fetchPeerHealth(options?: nodeFetch.RequestInit): Promise<Record<string, HealthStatus>> {
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
  network: 'mainnet' | 'goerli'
}
