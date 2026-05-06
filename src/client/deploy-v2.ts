import FormData from 'form-data'
import { IFetchComponent } from '@well-known-components/interfaces'
import { DeploymentData, DeploymentOptions, DeploymentProgress } from './types'
import { retryUpload } from './retry-upload'
import pLimit from 'p-limit'
import { DeploymentInitError, FileUploadError, FinalizeError } from './errors'
import type { Response } from '@well-known-components/interfaces/dist/components/fetcher'
import { addModelToFormData, isNode, sanitizeUrl } from './utils/Helper'

export type InitResult = {
  availableFiles: string[]
  missingFiles: string[]
  deploymentToken: string
  expiresAt: number
}

function arrayBufferFrom(value: Buffer | Uint8Array): Buffer | ArrayBuffer {
  return Buffer.isBuffer(value) ? value : value.buffer as ArrayBuffer
}

export async function initDeployment(
  serverUrl: string,
  data: DeploymentData,
  fetcher: IFetchComponent
): Promise<InitResult> {
  const url = `${sanitizeUrl(serverUrl)}/entities`
  const fileSizesManifest: Record<string, number> = {}
  for (const [hash, bytes] of data.files) {
    fileSizesManifest[hash] = bytes.byteLength
  }

  const form = new FormData()
  form.append('entityId', data.entityId)
  addModelToFormData(data.authChain, form, 'authChain')

  const entityFile = data.files.get(data.entityId)
  if (!entityFile) {
    throw new DeploymentInitError(`Entity file ${data.entityId} not found in deployment data`)
  }
  if (isNode()) {
    form.append(data.entityId, Buffer.from(arrayBufferFrom(entityFile)), data.entityId)
  } else {
    form.append(data.entityId, new Blob([arrayBufferFrom(entityFile)]), data.entityId)
  }
  form.append('fileSizesManifest', JSON.stringify(fileSizesManifest), {
    contentType: 'application/json'
  })

  let resp
  try {
    resp = await fetcher.fetch(url, {
      method: 'POST',
      headers: { 'Upload-Incomplete': '?1' },
      body: form as any
    })
  } catch (err) {
    throw new DeploymentInitError(`Network error during init`, { cause: err })
  }

  if (!resp.ok) {
    let body = ''
    try { body = await resp.text() } catch { /* best effort */ }
    throw new DeploymentInitError(`Init returned ${resp.status}: ${body}`)
  }

  return (await resp.json()) as InitResult
}

export type UploadFileInput = {
  serverUrl: string
  entityId: string
  fileHash: string
  bytes: Uint8Array
  deploymentToken: string
}

export type FileUploadOutcome =
  | { kind: 'ok' }
  | { kind: 'evicted' }
  | { kind: 'retryable'; cause: unknown }
  | { kind: 'fatal'; error: FileUploadError }

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export async function uploadFile(
  input: UploadFileInput,
  fetcher: IFetchComponent
): Promise<FileUploadOutcome> {
  const url = `${sanitizeUrl(input.serverUrl)}/entities/${input.entityId}/files/${input.fileHash}`

  let resp
  try {
    resp = await fetcher.fetch(url, {
      method: 'POST',
      headers: {
        'X-Deployment-Token': input.deploymentToken,
        'Content-Type': 'application/octet-stream'
      },
      body: Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength) as any
    })
  } catch (err) {
    return { kind: 'retryable', cause: err }
  }

  if (resp.ok && resp.status === 204) return { kind: 'ok' }
  if (resp.status === 404) return { kind: 'evicted' }
  if (RETRYABLE_STATUSES.has(resp.status)) {
    return { kind: 'retryable', cause: new Error(`HTTP ${resp.status}`) }
  }

  let body = ''
  try { body = await resp.text() } catch { /* best effort */ }
  return {
    kind: 'fatal',
    error: new FileUploadError(`File upload failed (HTTP ${resp.status}): ${body}`, {
      fileHash: input.fileHash,
      httpStatus: resp.status
    })
  }
}

export async function finalizeDeployment(
  serverUrl: string,
  entityId: string,
  deploymentToken: string,
  fetcher: IFetchComponent
): Promise<Response> {
  const url = `${sanitizeUrl(serverUrl)}/entities/${entityId}`
  let resp: Response
  try {
    resp = await fetcher.fetch(url, {
      method: 'POST',
      headers: { 'X-Deployment-Token': deploymentToken }
    })
  } catch (err) {
    throw new FinalizeError(`Network error during finalize`, { httpStatus: 0, cause: err })
  }

  if (resp.ok) return resp

  let bodyContent: unknown = undefined
  try {
    bodyContent = await resp.clone().json()
  } catch {
    try { bodyContent = await resp.text() } catch { /* best effort */ }
  }

  throw new FinalizeError(`Finalize returned HTTP ${resp.status}`, {
    httpStatus: resp.status,
    responseBody: bodyContent
  })
}

export async function deployV2(
  serverUrl: string,
  data: DeploymentData,
  options: DeploymentOptions,
  fetcher: IFetchComponent
): Promise<Response> {
  const parallelism = options.parallelism ?? 4
  const retries = options.retries ?? 3
  const baseDelayMs = options.retryBaseDelayMs ?? 500
  const resumeOnEviction = options.resumeOnEviction ?? true

  let init = await initDeployment(serverUrl, data, fetcher)

  let attemptedReinit = false
  const tryUploads = async (): Promise<'ok' | 'reinit-needed'> => {
    const limit = pLimit(parallelism)
    let uploaded = 0
    let bytesUploaded = 0
    const total = init.missingFiles.length
    const bytesTotal = init.missingFiles.reduce((acc, h) => acc + (data.files.get(h)?.byteLength ?? 0), 0)

    let evicted = false
    let firstFatal: FileUploadError | undefined

    const emit = () => {
      if (options.onProgress) {
        const progress: DeploymentProgress = { uploaded, total, bytesUploaded, bytesTotal }
        options.onProgress(progress)
      }
    }

    const tasks: Promise<void>[] = []
    for (const fileHash of init.missingFiles) {
      const bytes = data.files.get(fileHash)
      if (!bytes) {
        firstFatal = new FileUploadError(`Missing file ${fileHash} in deployment data`, { fileHash })
        break
      }
      tasks.push(limit(async () => {
        if (evicted || firstFatal) return
        const result = await retryUpload(
          () => uploadFile({ serverUrl, entityId: data.entityId, fileHash, bytes, deploymentToken: init.deploymentToken }, fetcher),
          { retries, baseDelayMs }
        )
        if (result.kind === 'evicted') { evicted = true; return }
        if (result.kind === 'fatal') { firstFatal = result.error; return }
        if (result.kind === 'retryable') {
          firstFatal = new FileUploadError(`File ${fileHash} failed after retries`, { fileHash, cause: result.cause })
          return
        }
        uploaded++
        bytesUploaded += bytes.byteLength
        emit()
      }))
    }

    await Promise.all(tasks)

    if (firstFatal) throw firstFatal
    if (evicted) return 'reinit-needed'
    return 'ok'
  }

  let uploadResult = await tryUploads()
  if (uploadResult === 'reinit-needed') {
    if (!resumeOnEviction || attemptedReinit) {
      throw new DeploymentInitError('Deployment evicted mid-upload and resume is disabled or already attempted')
    }
    attemptedReinit = true
    init = await initDeployment(serverUrl, data, fetcher)
    uploadResult = await tryUploads()
    if (uploadResult !== 'ok') {
      throw new DeploymentInitError('Deployment evicted twice — giving up')
    }
  }

  return finalizeDeployment(serverUrl, data.entityId, init.deploymentToken, fetcher)
}
