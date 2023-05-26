import { IFetchComponent, RequestOptions } from '@well-known-components/interfaces'
import * as nodeFetch from 'node-fetch'
import { getCurrentVersion, mergeRequestOptions } from './Helper'

export function withDefaultHeadersInjection(fetcher: IFetchComponent): IFetchComponent {
  return {
    fetch: async (url: nodeFetch.RequestInfo, init?: RequestOptions): Promise<nodeFetch.Response> => {
      const optionsWithInjectedClientAgent = mergeRequestOptions(init ? init : {}, {
        headers: { 'X-Requested-With': getCurrentVersion() }
      })

      return await fetcher.fetch(url, optionsWithInjectedClientAgent)
    }
  }
}

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
  return async function (baseUrl: string, fetch: IFetchComponent): Promise<T> {
    const response = await fetch.fetch(`${baseUrl}/${url}` + new URLSearchParams(params), {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {})
    })

    return response.json()
  }
}

export default useCustomClient
