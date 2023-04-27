import { ClientOptions } from './types'
import { AboutResponse } from '@dcl/protocol/out-js/decentraland/realm/about.gen'
import { sanitizeUrl } from './utils/Helper'
import { createContentClient, ContentClient } from './ContentClient'
import { createLambdasClient, LambdasClient } from './LambdasClient'
import { CatalystServerInfo } from '../types'

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type CatalystClient = {
  fetchAbout(): Promise<AboutResponse>
  getContentClient(): Promise<ContentClient>
  getLambdasClient(): Promise<LambdasClient>
}

export async function createCatalystClient(options: ClientOptions): Promise<CatalystClient> {
  const catalystUrl = sanitizeUrl(options.url)
  const { fetcher } = options

  let contentClient: undefined | ContentClient = undefined
  let lambdasClient: undefined | LambdasClient = undefined
  let about: AboutResponse | undefined = undefined

  async function fetchAbout(): Promise<AboutResponse> {
    const result = await fetcher.fetch(catalystUrl + '/about')
    const response = await result.json()

    if (!response) {
      throw new Error('Invalid about response')
    }

    about = response

    return response
  }

  async function getContentClient(): Promise<ContentClient> {
    if (contentClient) {
      return contentClient
    }

    if (!about) {
      about = await fetchAbout()
    }

    contentClient = createContentClient({
      url: about.content!.publicUrl,
      fetcher
    })

    return contentClient
  }

  async function getLambdasClient(): Promise<LambdasClient> {
    if (lambdasClient) {
      return lambdasClient
    }

    if (!about) {
      about = await fetchAbout()
    }

    lambdasClient = createLambdasClient({
      url: about.lambdas!.publicUrl,
      fetcher
    })

    return lambdasClient
  }

  return {
    fetchAbout,
    getContentClient,
    getLambdasClient
  }
}

export async function connectedToRandomCatalyst(
  servers: CatalystServerInfo[],
  options: Pick<ClientOptions, 'fetcher'>
): Promise<CatalystClient | undefined> {
  const shuffled = shuffleArray(servers)

  for (const server of shuffled) {
    const client = await createCatalystClient({ ...options, url: server.address })
    const about = await client.fetchAbout()

    if (about.healthy) {
      return client
    }
  }

  return undefined
}
