/**
 * Generated by orval v6.16.0 🍺
 * Do not edit manually.
 * API Specification for the Decentraland Catalyst Server (BETA)
 * A Catalyst is a Server that runs different services. These services currently work as the backbone for Decentraland and work in a decentralized network. The current specification details the following services: <br/><br/>- Archipelago <br/>- Content Server <br/>- Lambdas Service <br/> <br/>WARNING: We are working to close the version 1.0 of the Catalyst Protocol defined by this API. So far this is what we have and it's public but we are still working on refinement and during this process we may decided to deprecate or change some of the endpoints.
 * OpenAPI spec version: 1.0
 */
import { useCustomClient } from '../utils/fetcher'
export type ValidateSignature200 = { [key: string]: any }

export type ValidateSignatureBody = { [key: string]: any }

export type SearchWearablesParams = {
  /**
   * Lis of URNs that identify the collection. Maximum amount of ids allowed is 500.
   */
  collectionId?: string[]
  /**
   * List of wearables URNs to search. Maximum amount of ids allowed is 500.
   */
  wearableId?: string[]
  /**
   * Search text
   */
  textSearch?: string
  /**
   * Limit the quantity of results that will be returned by the request. You can only request up to 500 results.
   */
  limit?: number
  /**
   * The result will always be ordered by the local timestamp fields but in case of timestamp collisions, you can use the lastId field to filter the result
   */
  lastId?: string
}

export type GetThirdPartyCollection200 = {
  elements: ThirdPartyWearable[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export type GetThirdPartyCollectionParams = {
  /**
   * The number of the requested page.
   */
  pageNum?: string
  /**
   * The size of the requested page.
   */
  pageSize?: string
}

export type GetThirdPartyWearables200 = {
  elements: ThirdPartyWearable[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export type GetThirdPartyWearablesParams = {
  /**
   * The number of the requested page.
   */
  pageNum?: string
  /**
   * The size of the requested page.
   */
  pageSize?: string
}

export type GetLandsParams = {
  /**
   * The number of the requested page. It needs `pageSize` to be present to enable a paginated response.
   */
  pageNum?: string
  /**
   * The size of the requested page. It needs `pageNum` to be present to enable a paginated response.
   */
  pageSize?: string
}

export type GetNamesParams = {
  /**
   * The number of the requested page. It needs `pageSize` to be present to enable a paginated response.
   */
  pageNum?: string
  /**
   * The size of the requested page. It needs `pageNum` to be present to enable a paginated response.
   */
  pageSize?: string
}

export type GetEmotes200 = {
  elements: Emote[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export type GetEmotesParams = {
  /**
   * Third Party collection Id to filter emotes, if this param is not sent then the 3rd parties emotes are not shown. If it is sent, only the 3rd parties emotes are shown.
   */
  collectionId?: string
  /**
   * If present, response will be extended with the entity data.
   */
  includeEntities?: boolean
  /**
   * The number of the requested page.
   */
  pageNum?: string
  /**
   * The size of the requested page
   */
  pageSize?: string
}

export type GetWearables200 = {
  elements: Wearable[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export type GetWearablesParams = {
  /**
   * If present, response will be extended with the entity data.
   */
  includeEntities?: boolean
  /**
   * If present, response will include the third-party wearables owned by the address. They will appear before other wearables if the response is paginated.
   */
  includeThirdParty?: boolean
  /**
   * The number of the requested page.
   */
  pageNum?: string
  /**
   * The size of the requested page.
   */
  pageSize?: string
  /**
   * Determines the field to be sort by. By default it will be by `transferredAt`. Possible values: `transferredAt` and `rarity`.
   */
  orderBy?: string
}

export type GetCollections200CollectionsItem = {
  id: string
  name: string
}

export type GetCollections200 = {
  collections?: GetCollections200CollectionsItem[]
}

export type PeersPeersItem = {
  id?: string
  address?: string
  parcel?: number[]
  position?: number[]
  lastPing?: number
}

export interface Peers {
  ok?: boolean
  peers?: PeersPeersItem[]
}

export type IslandIdPeersItem = {
  id?: string
  address?: string
  parcel?: number[]
  position?: number[]
  lastPing?: number
  preferedIslandId?: string
}

export interface IslandId {
  id?: string
  peers?: IslandIdPeersItem[]
  maxPeers?: number
  center?: number[]
  radius?: number
}

export type IslandsIslandsItemPeersItem = {
  id?: string
  address?: string
  parcel?: number[]
  position?: number[]
  lastPing?: number
  preferedIslandId?: string
}

export type IslandsIslandsItem = {
  id?: string
  peers?: IslandsIslandsItemPeersItem[]
  maxPeers?: number
  center?: number[]
  radius?: number
}

export interface Islands {
  ok?: boolean
  islands?: IslandsIslandsItem[]
}

export type ThirdPartyIntegrationsDataItem = {
  urn: string
  name?: string
  description?: string
}

export interface ThirdPartyIntegrations {
  data: ThirdPartyIntegrationsDataItem[]
}

export type ProfileAvatarsItem = {
  userId?: string
  email?: string
  name?: string
  hasClaimedName?: boolean
  description?: string
  ethAddress?: string
  version?: number
  avatar?: ProfileAvatarsItemAvatar
  tutorialStep?: number
  interests?: string[]
  unclaimedName?: string
}

export interface Profile {
  avatars?: ProfileAvatarsItem[]
}

export type ProfileAvatarsItemAvatarSkinColor = {
  r?: number
  g?: number
  b?: number
}

export type ProfileAvatarsItemAvatarSkin = {
  color?: ProfileAvatarsItemAvatarSkinColor
}

export type ProfileAvatarsItemAvatarHairColor = {
  r?: number
  g?: number
  b?: number
}

export type ProfileAvatarsItemAvatarHair = {
  color?: ProfileAvatarsItemAvatarHairColor
}

export type ProfileAvatarsItemAvatarEyesColor = {
  r?: number
  g?: number
  b?: number
}

export type ProfileAvatarsItemAvatarEyes = {
  color?: ProfileAvatarsItemAvatarEyesColor
}

export type ProfileAvatarsItemAvatarSnapshots = {
  face?: string
  face128?: string
  face256?: string
  body?: string
}

export type ProfileAvatarsItemAvatar = {
  bodyShape?: string
  snapshots?: ProfileAvatarsItemAvatarSnapshots
  eyes?: ProfileAvatarsItemAvatarEyes
  hair?: ProfileAvatarsItemAvatarHair
  skin?: ProfileAvatarsItemAvatarSkin
  wearables?: string[]
}

export interface PostProfiles {
  ids?: string[]
}

export type RealmsItem = {
  serverName?: string
  url?: string
  layer?: string
  usersCount?: number
  maxUsers?: number
  userParcels?: number[][]
}

export type Realms = RealmsItem[]

export type HotScenesItemRealmsItem = {
  serverName?: string
  url?: string
  layer?: string
  usersCount?: number
  maxUsers?: number
  userParcels?: number[][]
}

export type HotScenesItem = {
  id?: string
  name?: string
  baseCoords?: number[]
  usersTotalCount?: number
  parcels?: number[][]
  thumbnail?: string
  creator?: string
  description?: string
  realms?: HotScenesItemRealmsItem[]
}

export type HotScenes = HotScenesItem[]

export type DenylistedUsernames = string[]

export type Pois = string[]

export type ServersItem = {
  baseUrl?: string
  owner?: string
  id?: string
}

export type Servers = ServersItem[]

export type WearablesPagination = {
  limit?: number
  next?: string
}

export type WearablesFilters = {
  textSearch?: string
}

export interface Wearables {
  wearables?: WearablesWearablesItem[]
  filters?: WearablesFilters
  pagination?: WearablesPagination
}

export type WearablesWearablesItemI18nItem = {
  code?: string
  text?: string
}

export type WearablesWearablesItem = {
  id?: string
  description?: string
  image?: string
  thumbnail?: string
  collectionAddress?: string
  rarity?: string
  data?: WearablesWearablesItemData
  i18n?: WearablesWearablesItemI18nItem[]
  createdAt?: number
  updatedAt?: number
}

export type WearablesWearablesItemDataRepresentationsItemContentsItem = {
  key?: string
  url?: string
}

export type WearablesWearablesItemDataRepresentationsItemOverrideHidesItem = { [key: string]: any }

export type WearablesWearablesItemDataRepresentationsItemOverrideReplacesItem = { [key: string]: any }

export type WearablesWearablesItemDataRepresentationsItem = {
  bodyShapes?: string[]
  mainFile?: string
  overrideReplaces?: WearablesWearablesItemDataRepresentationsItemOverrideReplacesItem[]
  overrideHides?: WearablesWearablesItemDataRepresentationsItemOverrideHidesItem[]
  contents?: WearablesWearablesItemDataRepresentationsItemContentsItem[]
}

export type WearablesWearablesItemData = {
  replaces?: string[]
  hides?: string[]
  tags?: string[]
  category?: string
  representations?: WearablesWearablesItemDataRepresentationsItem[]
}

export type ThirdPartyWearableIndividualDataItem = {
  id?: string
}

export interface ThirdPartyWearable {
  urn: string
  amount?: number
  name: string
  category: string
  entity: Entity
  individualData?: ThirdPartyWearableIndividualDataItem[]
}

export type LandsPaginatedElementsItem = {
  name?: string
  contractAddress: string
  tokenId: string
  price?: number
  category: string
  x?: string
  y?: string
  image?: string
  description?: string
}

export interface LandsPaginated {
  elements: LandsPaginatedElementsItem[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export type NamesPaginatedElementsItem = {
  name: string
  contractAddress: string
  tokenId: string
  price?: number
}

export interface NamesPaginated {
  elements: NamesPaginatedElementsItem[]
  totalAmount: number
  pageNum: number
  pageSize: number
}

export interface LambdasError {
  error: string
  message: string
}

export type WearableIndividualDataItem = {
  id?: string
  tokenId?: string
  transferredAt?: number
  price?: number
}

export interface Wearable {
  urn: string
  amount?: number
  name: string
  rarity: string
  category: string
  entity?: Entity
  individualData?: WearableIndividualDataItem[]
}

export type Erc721AttributesItem = {
  trait_type?: string
  value?: string
}

export interface Erc721 {
  id?: string
  name?: string
  description?: string
  language?: string
  image?: string
  thumbnail?: string
  attributes?: Erc721AttributesItem[]
}

export interface StatusLambdas {
  version?: string
  currentTime?: number
  contentServerUrl?: string
  commitHash?: string
  catalystVersion?: string
}

export type StatusContentSynchronizationStatusOtherServersItem = {
  address: string
  connectionState: string
  lastDeploymentTimestamp: number
}

export type StatusContentSynchronizationStatus = {
  otherServers?: StatusContentSynchronizationStatusOtherServersItem[]
  lastSyncWithDAO: number
  synchronizationState: string
  lastSyncWithOtherServers?: number
}

export interface StatusContent {
  name?: string
  version: string
  currentTime?: number
  lastImmutableTime?: number
  historySize?: number
  synchronizationStatus: StatusContentSynchronizationStatus
  commitHash: string
  catalystVersion: string
  ethNetwork: string
}

export type SnapshotsItemTimeRange = {
  initTimestamp: number
  endTimestamp: number
}

export type SnapshotsItem = {
  hash: string
  timeRange: SnapshotsItemTimeRange
  replacedSnapshotHashes?: string[]
  numberOfEntities: number
  generationTimestamp: number
}

export type Snapshots = SnapshotsItem[]

export type PointerChangesDeltasItem = {
  entityType: string
  entityId: string
  localTimestamp: number
  pointers: string[]
  authChain: AuthChain
}

export interface PointerChanges {
  deltas: PointerChangesDeltasItem[]
}

export type FailedDeploymentsItem = {
  failedDeploymentsRepo?: string
  entityType: string
  entityId: string
  reason: string
  errorDescription: string
}

export type FailedDeployments = FailedDeploymentsItem[]

export type EntityMetadata = { [key: string]: any }

export type EntityContentItem = {
  file: string
  hash: string
}

export interface Entity {
  version: string
  id: string
  type: string
  timestamp: number
  pointers: string[]
  content: EntityContentItem[]
  metadata?: EntityMetadata
}

export interface Emote {
  urn: string
  amount?: number
  category: string
  entity?: Entity
}

export interface Errors {
  errors: string[]
}

export type AvailableContentItem = {
  cid: string
  available: boolean
}

export type AvailableContent = AvailableContentItem[]

export interface Error {
  error: string
}

export type AuthChainItem = {
  type: string
  payload: string
  signature?: string
}

export type AuthChain = AuthChainItem[]

export interface AuditResponse {
  version: string
  localTimestamp: number
  authChain: AuthChain
  overwrittenBy?: string
  isDenylisted?: boolean
  denylistedContent?: string[]
}

export type StatsParcelsParcelsItemParcel = {
  x?: number
  y?: number
}

export type StatsParcelsParcelsItem = {
  peersCount?: number
  parcel?: StatsParcelsParcelsItemParcel
}

export interface StatsParcels {
  parcels?: StatsParcelsParcelsItem[]
}

export type AboutBff = {
  healthy: boolean
  commitHash?: string
  usersCount?: number
  publicUrl: string
  protocolVersion: string
}

export type AboutLambdas = {
  healthy: boolean
  commitHash?: string
  version?: string
  publicUrl: string
}

export type AboutComms = {
  healthy: boolean
  protocol: string
  commitHash?: string
  userCount?: string
}

export type AboutContent = {
  healthy: boolean
  commitHash?: string
  version?: string
  publicUrl: string
}

export interface About {
  healthy: boolean
  acceptingUsers: boolean
  configurations: AboutConfigurations
  content: AboutContent
  comms: AboutComms
  lambdas: AboutLambdas
  bff?: AboutBff
}

export type AboutConfigurationsSkybox = {
  fixedHour?: number
}

export type AboutConfigurationsMinimap = {
  enabled: boolean
  dataImage?: string
  estateImage?: string
}

export type AboutConfigurations = {
  realmName?: string
  networkId: number
  globalScenesUrn: string[]
  scenesUrn: string[]
  minimap?: AboutConfigurationsMinimap
  skybox?: AboutConfigurationsSkybox
}

/**
 * Retrieve detailed information about the services
 * @summary Catalyst Server status
 */
export const getLambdaStatus = () => {
  return useCustomClient<StatusLambdas>({ url: `/lambdas/status`, method: 'get' })
}

/**
 * Retrieve the list of collections URNs
 * @summary Get Collections
 */
export const getCollections = () => {
  return useCustomClient<GetCollections200>({ url: `/lambdas/collections`, method: 'get' })
}

/**
 * Downloads a thumbnail image for the specified urn
 * @summary Download thumbnail image
 */
export const getThumbnail = (urn: string) => {
  return useCustomClient<Blob>({
    url: `/lambdas/collections/contents/${urn}/thumbnail`,
    method: 'get',
    responseType: 'blob'
  })
}

/**
 * Downloads the image for the specified urn
 * @summary Download URN image
 */
export const getImage = (urn: string) => {
  return useCustomClient<Blob>({
    url: `/lambdas/collections/contents/${urn}/image`,
    method: 'get',
    responseType: 'blob'
  })
}

/**
 * Retrieve ERC721/NFT Entity details
 * @summary Get ERC721 Entity
 */
export const getStandardErc721 = (chainId: string, contract: string, option: string, emission: string) => {
  return useCustomClient<Erc721>({
    url: `/lambdas/collections/standard/erc721/${chainId}/${contract}/${option}/${emission}`,
    method: 'get'
  })
}

/**
 * Get a list of wearables owned by the given address
 * @summary Get list of wearables for an address
 */
export const getWearables = (address: string, params?: GetWearablesParams) => {
  return useCustomClient<GetWearables200>({ url: `/lambdas/users/${address}/wearables`, method: 'get', params })
}

/**
 * Get a list of emotes owned by the given address
 * @summary Get list of emotes for an address
 */
export const getEmotes = (address: string, params?: GetEmotesParams) => {
  return useCustomClient<GetEmotes200>({ url: `/lambdas/users/${address}/emotes`, method: 'get', params })
}

/**
 * Get a list of names owned by the given address
 * @summary Get list of names for an address
 */
export const getNames = (address: string, params?: GetNamesParams) => {
  return useCustomClient<NamesPaginated>({ url: `/lambdas/users/${address}/names`, method: 'get', params })
}

/**
 * Get a list of lands owned by the given address
 * @summary Get list of lands for an address
 */
export const getLands = (address: string, params?: GetLandsParams) => {
  return useCustomClient<LandsPaginated>({ url: `/lambdas/users/${address}/lands`, method: 'get', params })
}

/**
 * Returns the list of third party wearables for the provided address
 * @summary Returns the list of third party wearables for the provided address
 */
export const getThirdPartyWearables = (address: string, params?: GetThirdPartyWearablesParams) => {
  return useCustomClient<GetThirdPartyWearables200>({
    url: `/lambdas/users/${address}/third-party-wearables`,
    method: 'get',
    params
  })
}

/**
 * Returns the list of third party wearables for the given collection
 * @summary Returns the list of third party wearables for the given collection
 */
export const getThirdPartyCollection = (
  address: string,
  collectionId: string,
  params?: GetThirdPartyCollectionParams
) => {
  return useCustomClient<GetThirdPartyCollection200>({
    url: `/lambdas/users/${address}/third-party-wearables/${collectionId}`,
    method: 'get',
    params
  })
}

/**
 * Search for wearables based on the applied filters and retrieve detailed information
 * @deprecated
 * @summary Search Wearables
 */
export const searchWearables = (params?: SearchWearablesParams) => {
  return useCustomClient<Wearables>({ url: `/lambdas/collections/wearables`, method: 'get', params })
}

/**
 * Retrieve the list of Catalyst Servers
 * @summary Get Servers list
 */
export const getServers = () => {
  return useCustomClient<Servers>({ url: `/lambdas/contracts/servers`, method: 'get' })
}

/**
 * Retrieve the Point of Interest list of coordinates
 * @summary Retrieve DCL Point of Interests
 */
export const getPois = () => {
  return useCustomClient<Pois>({ url: `/lambdas/contracts/pois`, method: 'get' })
}

/**
 * Retrieve list of forbidden user names. The prohibition of these names is decided through the DAO and need to be voted, the list lives in a Smart Contract and the Catalyst just consumes this information to present it to the client. In order to add a new name a new proposal needs to be created, approved and a transaction should be sent by a DAO committee member.
 * @summary Denylisted user names
 */
export const getDenylistedUserNames = () => {
  return useCustomClient<DenylistedUsernames>({ url: `/lambdas/contracts/denylisted-names`, method: 'get' })
}

/**
 * Given a signed message and it's AuthChain, validate it's authenticity. A message can be signed, for example, to prove ownership of the Entity pointers that they want to modify.
 * @deprecated
 * @summary Validate signed message
 */
export const validateSignature = (validateSignatureBody: ValidateSignatureBody) => {
  return useCustomClient<ValidateSignature200>({
    url: `/lambdas/crypto/validate-signature`,
    method: 'post',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    data: validateSignatureBody
  })
}

/**
 * Returns the list of scenes where there are more users with coordinates and the list of parcels that compose the scene.
 * @summary Hot Scenes
 */
export const getHotScenes = () => {
  return useCustomClient<HotScenes>({ url: `/lambdas/explore/hot-scenes`, method: 'get' })
}

/**
 * Returns the list of realms with details about the users in it
 * @summary Get Realms status
 */
export const getRealms = () => {
  return useCustomClient<Realms>({ url: `/lambdas/explore/realms`, method: 'get' })
}

/**
 * Returns all the Avatars details associated with the Ethereum addresses in the body
 * @summary Get Avatars details
 */
export const getAvatarsDetailsByPost = (postProfiles: PostProfiles) => {
  return useCustomClient<Profile[]>({
    url: `/lambdas/profiles`,
    method: 'post',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    data: postProfiles
  })
}

/**
 * Given a Ethereum address of a user, return the Avatars details associated with it.
 * @summary Get Avatar details
 */
export const getAvatarDetails = (id: string) => {
  return useCustomClient<Profile>({ url: `/lambdas/profiles/${id}`, method: 'get' })
}

/**
 * Returns the list of third party integrations and collections
 * @summary Returns the list of third party integrations as well as collections
 */
export const getThirdPartyIntegrations = () => {
  return useCustomClient<ThirdPartyIntegrations>({ url: `/lambdas/third-party-integrations`, method: 'get' })
}

type AwaitedInput<T> = PromiseLike<T> | T

type Awaited<O> = O extends AwaitedInput<infer T> ? T : never

export type GetLambdaStatusResult = NonNullable<Awaited<ReturnType<typeof getLambdaStatus>>>
export type GetCollectionsResult = NonNullable<Awaited<ReturnType<typeof getCollections>>>
export type GetThumbnailResult = NonNullable<Awaited<ReturnType<typeof getThumbnail>>>
export type GetImageResult = NonNullable<Awaited<ReturnType<typeof getImage>>>
export type GetStandardErc721Result = NonNullable<Awaited<ReturnType<typeof getStandardErc721>>>
export type GetWearablesResult = NonNullable<Awaited<ReturnType<typeof getWearables>>>
export type GetEmotesResult = NonNullable<Awaited<ReturnType<typeof getEmotes>>>
export type GetNamesResult = NonNullable<Awaited<ReturnType<typeof getNames>>>
export type GetLandsResult = NonNullable<Awaited<ReturnType<typeof getLands>>>
export type GetThirdPartyWearablesResult = NonNullable<Awaited<ReturnType<typeof getThirdPartyWearables>>>
export type GetThirdPartyCollectionResult = NonNullable<Awaited<ReturnType<typeof getThirdPartyCollection>>>
export type SearchWearablesResult = NonNullable<Awaited<ReturnType<typeof searchWearables>>>
export type GetServersResult = NonNullable<Awaited<ReturnType<typeof getServers>>>
export type GetPoisResult = NonNullable<Awaited<ReturnType<typeof getPois>>>
export type GetDenylistedUserNamesResult = NonNullable<Awaited<ReturnType<typeof getDenylistedUserNames>>>
export type ValidateSignatureResult = NonNullable<Awaited<ReturnType<typeof validateSignature>>>
export type GetHotScenesResult = NonNullable<Awaited<ReturnType<typeof getHotScenes>>>
export type GetRealmsResult = NonNullable<Awaited<ReturnType<typeof getRealms>>>
export type GetAvatarsDetailsByPostResult = NonNullable<Awaited<ReturnType<typeof getAvatarsDetailsByPost>>>
export type GetAvatarDetailsResult = NonNullable<Awaited<ReturnType<typeof getAvatarDetails>>>
export type GetThirdPartyIntegrationsResult = NonNullable<Awaited<ReturnType<typeof getThirdPartyIntegrations>>>
