import { AuthChain, EntityType } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'

/**
 * Options for an outbound request made by the client.
 *
 * This is the structural common subset shared by the `node-fetch`-based
 * `RequestOptions` from `@well-known-components/interfaces` and the native
 * (undici) `RequestOptions` from `@dcl/core-commons`, so a fetcher from either
 * package can be passed to the client.
 */
export type RequestOptions = {
  method?: string
  headers?: Record<string, string>
  body?: any
  signal?: AbortSignal
  abortController?: AbortController
  timeout?: number
  attempts?: number
  retryDelay?: number
}

/**
 * Minimal response shape consumed by the client. Both the `node-fetch`
 * `Response` and the native (undici) global `Response` structurally satisfy it.
 */
export type FetchResponse = {
  ok: boolean
  status: number
  json(): Promise<any>
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * The fetch component the client depends on.
 *
 * Defined locally as the narrow surface the client actually uses (string URLs
 * only, reading `json()`/`arrayBuffer()` off the response) so that both the
 * `@well-known-components/interfaces` fetcher and the native-fetch
 * `@dcl/core-commons` fetcher are assignable to it.
 */
export type IFetchComponent = {
  fetch(url: string, init?: RequestOptions): Promise<FetchResponse>
}

export type DeploymentPreparationData = {
  entityId: string
  files: Map<string, Uint8Array>
}

export type DeploymentData = DeploymentPreparationData & {
  authChain: AuthChain
}

export type BuildEntityOptions = {
  type: EntityType
  pointers: string[]
  files?: Map<string, Uint8Array>
  metadata?: any
  timestamp?: number
}

export type BuildEntityWithoutFilesOptions = {
  type: EntityType
  pointers: string[]
  hashesByKey?: Map<string, string>
  metadata?: any
  timestamp?: number
}

export type ServerMetadata = {
  baseUrl: string
  owner: string
  id: string
}

export type ParallelConfig = {
  urls: string[]
}

export type ClientOptions = {
  url: string
  fetcher: IFetchComponent
  logger?: ILoggerComponent.ILogger
  /**
   * When set, the client will fetch entities from the given urls in parallel
   * and return the first successful response.
   * @type {ParallelConfig}
   */
  parallelConfig?: ParallelConfig
}
