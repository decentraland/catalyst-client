import FormData from 'form-data'
import { IFetchComponent } from '@well-known-components/interfaces'
import { DeploymentData } from './types'
import { DeploymentInitError } from './errors'
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
