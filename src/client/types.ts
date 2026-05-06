import { AuthChain, EntityType } from '@dcl/schemas'
import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

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

export type DeploymentProtocolVersion = 'v1' | 'v2' | 'auto'

export type DeploymentProgress = {
  uploaded: number // file count uploaded
  total: number // total file count to upload
  bytesUploaded: number
  bytesTotal: number
}

export type DeploymentOptions = {
  /** Forces a specific protocol; default 'auto' (probe via OPTIONS). */
  deploymentProtocolVersion?: DeploymentProtocolVersion
  /** Max parallel file uploads in v2. Default 4. */
  parallelism?: number
  /** Retries per file (v2). Default 3. */
  retries?: number
  /** Base delay for exponential backoff between retries (v2). Default 500ms. */
  retryBaseDelayMs?: number
  /** If true (default), v2 client re-initializes on a 404 mid-upload (deployment evicted). */
  resumeOnEviction?: boolean
  /** Optional progress callback (v2 only). */
  onProgress?: (state: DeploymentProgress) => void
  /** Forwarded to the underlying fetcher. */
  timeout?: number
}
