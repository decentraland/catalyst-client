import { IFetchComponent } from '../types'
import { ContentDownloadError } from './errors'

type HttpMethod = 'get' | 'head' | 'post' | 'put' | 'delete' | 'patch'

type Context = {
  url: string
  // orval >= 6.31 emits upper-case methods
  method: Uppercase<HttpMethod> | HttpMethod
  params?: any
  data?: any
  responseType?: 'blob' | 'json'
  headers?: Record<string, string>
}

export type CustomClient<T> = (baseUrl: string, fetch: IFetchComponent) => Promise<T>

// Arrays become repeated keys; null and undefined are left out (presence flags would read them as set).
function toSearchParams(params?: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) searchParams.append(key, String(item))
    }
  }
  return searchParams
}

// NOTE: used by orval generator
export const useCustomClient = <T>({ url, method, params, data, responseType, headers }: Context): CustomClient<T> => {
  const relPath = url.substring('/lambdas'.length + 1)
  const httpMethod = method.toLowerCase() as HttpMethod
  return async function (baseUrl: string, fetch: IFetchComponent): Promise<T> {
    const response = await fetch.fetch(`${baseUrl}/${relPath}?` + toSearchParams(params), {
      method: httpMethod,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {})
    })

    // A HEAD response has no body to parse.
    if (httpMethod === 'head') return undefined as T

    // Binary operations (images, thumbnails) aren't JSON
    if (responseType === 'blob') {
      if (!response.ok) {
        // Read the error body so the connection is released
        const body = await response.text().catch(() => undefined)
        throw new ContentDownloadError(`Failed to download ${relPath}: HTTP ${response.status}`, response.status, body)
      }
      const type = response.headers?.get('content-type') ?? undefined
      return new Blob([await response.arrayBuffer()], type ? { type } : undefined) as T
    }

    return response.json()
  }
}

export default useCustomClient
