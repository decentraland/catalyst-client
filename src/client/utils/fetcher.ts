import * as crossFetch from 'cross-fetch'
import * as nodeFetch from 'node-fetch'
import { mergeRequestOptions } from './Helper'
import { CURRENT_VERSION } from './data'

export type RequestOptions = nodeFetch.RequestInit & {
  attempts?: number
  waitTime?: number
}

export type RequestInfo = nodeFetch.RequestInfo

export type Response = nodeFetch.Response

export type IFetchComponent = {
  fetch(url: RequestInfo, init?: RequestOptions): Promise<Response>
}

export function withClientAgentInjection(fetcher: IFetchComponent): IFetchComponent {
  return {
    fetch: async (url: RequestInfo, init?: RequestOptions): Promise<Response> => {
      const optionsWithInjectedClientAgent = mergeRequestOptions(init ? init : {}, {
        headers: { 'X-Requested-With': CURRENT_VERSION || 'Unknown' }
      })

      return await fetcher.fetch(url, optionsWithInjectedClientAgent)
    }
  }
}

export function createFetchComponent(defaultOptions: RequestOptions = { timeout: 0 }): IFetchComponent {
  async function internalFetch(url: RequestInfo, init: RequestOptions): Promise<Response> {
    const controller = new AbortController()
    const timeoutTime = init.timeout
      ? setTimeout(() => {
          controller.abort()
        }, init.timeout)
      : 0

    try {
      const response = (await crossFetch.default(url.toString(), init as any)) as any

      if (response.ok) {
        return response
      } else {
        const responseText = await response.text()
        throw new Error(`Failed to fetch ${url}. Got status ${response.status}. Response was '${responseText}'`)
      }
    } finally {
      if (timeoutTime) clearTimeout(timeoutTime)
    }
  }

  async function fetch(url: RequestInfo, init?: RequestOptions): Promise<Response> {
    return (await internalFetch(url.toString(), { ...defaultOptions, ...init })) as any
  }

  return { fetch }
}
