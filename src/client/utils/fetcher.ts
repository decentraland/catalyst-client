import { IFetchComponent } from '../types'
import { ContentDownloadError } from './errors'

type Context = {
  url: string
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  params?: any
  data?: any
  responseType?: 'blob' | 'json'
  headers?: Record<string, string>
}

export type CustomClient<T> = (baseUrl: string, fetch: IFetchComponent) => Promise<T>

// NOTE: used by orval generator
export const useCustomClient = <T>({ url, method, params, data, responseType, headers }: Context): CustomClient<T> => {
  const relPath = url.substring('/lambdas'.length + 1)
  return async function (baseUrl: string, fetch: IFetchComponent): Promise<T> {
    const response = await fetch.fetch(`${baseUrl}/${relPath}?` + new URLSearchParams(params), {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {})
    })

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
