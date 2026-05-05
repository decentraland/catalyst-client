export class DeploymentInitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'DeploymentInitError'
    if (options?.cause !== undefined) {
      ;(this as any).cause = options.cause
    }
  }
}

export class FileUploadError extends Error {
  readonly fileHash: string
  readonly httpStatus?: number
  constructor(message: string, options: { fileHash: string; httpStatus?: number; cause?: unknown }) {
    super(message)
    this.name = 'FileUploadError'
    this.fileHash = options.fileHash
    this.httpStatus = options.httpStatus
    if (options.cause !== undefined) {
      ;(this as any).cause = options.cause
    }
  }
}

export class FinalizeError extends Error {
  readonly httpStatus: number
  readonly responseBody?: unknown
  constructor(message: string, options: { httpStatus: number; responseBody?: unknown; cause?: unknown }) {
    super(message)
    this.name = 'FinalizeError'
    this.httpStatus = options.httpStatus
    this.responseBody = options.responseBody
    if (options.cause !== undefined) {
      ;(this as any).cause = options.cause
    }
  }
}

export class ProtocolUnsupportedError extends Error {
  readonly serverUrl: string
  constructor(serverUrl: string) {
    super(`v2 deployment protocol forced but server ${serverUrl} does not advertise it`)
    this.name = 'ProtocolUnsupportedError'
    this.serverUrl = serverUrl
  }
}
