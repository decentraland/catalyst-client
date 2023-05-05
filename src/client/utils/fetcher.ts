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
