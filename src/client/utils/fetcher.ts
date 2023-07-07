import { IFetchComponent } from '@well-known-components/interfaces'

type Context = {
  url: string
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  params?: any
  data?: any
  responseType?: string
  headers?: Record<string, string>
}

export type CustomClient<T> = (baseUrl: string, fetch: IFetchComponent) => Promise<T>

// NOTE: used by orval generator
export const useCustomClient = <T>({ url, method, params, data, headers }: Context): CustomClient<T> => {
  const relPath = url.substring('/lambdas'.length + 1)
  return async function (baseUrl: string, fetch: IFetchComponent): Promise<T> {
    const response = await fetch.fetch(`${baseUrl}/${relPath}` + new URLSearchParams(params), {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {})
    })

    return response.json()
  }
}

export default useCustomClient
