import * as crossFetch from 'cross-fetch'
import ms from 'ms'
import * as nodeFetch from 'node-fetch'

export type RequestOptions = nodeFetch.RequestInit & {
  attempts?: number
  timeOut?: string
  waitTime?: string
}

export type RequestInfo = nodeFetch.RequestInfo

export type Response = nodeFetch.Response

export interface IFetchComponent {
  mergeRequestOptions(target: RequestOptions, source?: RequestOptions): RequestOptions
  fetch(url: RequestInfo, init?: RequestOptions): Promise<Response>
}

export function createFetchComponent(): IFetchComponent {
  async function internalFetch(url: RequestInfo, init: RequestOptions): Promise<Response> {
    const controller = new AbortController()
    const timeoutTime = ms(init.timeOut)
    const timeout = timeoutTime
      ? setTimeout(() => {
          controller.abort()
        }, timeoutTime)
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
      if (timeout) clearTimeout(timeout)
    }
  }

  async function fetch(url: RequestInfo, init?: RequestOptions): Promise<Response> {
    return (await internalFetch(url.toString(), { timeOut: '0s', ...init })) as any
  }

  function mergeRequestOptions(target: RequestOptions, source?: RequestOptions): RequestOptions {
    const combinedHeaders = {
      ...target?.headers,
      ...source?.headers
    }

    return {
      ...target,
      ...source,
      headers: combinedHeaders
    }
  }

  return { fetch, mergeRequestOptions }
}
