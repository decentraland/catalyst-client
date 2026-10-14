import { IFetchComponent } from '../types'

type Context = {
  url: string
  method: 'get' | 'head' | 'post' | 'put' | 'delete' | 'patch'
  params?: any
  data?: any
  responseType?: string
  headers?: Record<string, string>
}

export type CustomClient<T> = (baseUrl: string, fetch: IFetchComponent) => Promise<T>

// Arrays become repeated keys and undefined values are left out.
function toSearchParams(params?: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) searchParams.append(key, String(item))
    }
  }
  return searchParams
}

// NOTE: used by orval generator
export const useCustomClient = <T>({ url, method, params, data, headers }: Context): CustomClient<T> => {
  const relPath = url.substring('/lambdas'.length + 1)
  return async function (baseUrl: string, fetch: IFetchComponent): Promise<T> {
    const response = await fetch.fetch(`${baseUrl}/${relPath}?` + toSearchParams(params), {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {})
    })

    // A HEAD response has no body to parse.
    if (method === 'head') return undefined as T

    return response.json()
  }
}

export default useCustomClient
