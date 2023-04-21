import { About, ClientOptions } from './types'
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
  getAbout(ttl: number): Promise<About>
  getContentClient(): Promise<ContentClient>
  getLambdasClient(): Promise<LambdasClient>
}

export async function createCatalystClient(options: ClientOptions): Promise<CatalystClient> {
  const catalystUrl = sanitizeUrl(options.url)
  const { fetcher } = options

  let contentClient: undefined | ContentClient = undefined
  let lambdasClient: undefined | LambdasClient = undefined
  let about: About | undefined = undefined

  async function getAbout(ttl: number): Promise<About> {
    if (!about || Date.now() - about.timestamp > ttl) {
      const result = await fetcher.fetch(catalystUrl + '/about')
      about = await result.json()

      if (!about) {
        throw new Error('Invalid about response')
      }
    }

    return about
  }

  async function getContentClient(): Promise<ContentClient> {
    if (contentClient) {
      return contentClient
    }

    if (!about) {
      about = await getAbout(0)
    }

    contentClient = await createContentClient({
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
      about = await getAbout(0)
    }

    lambdasClient = await createLambdasClient({
      url: about.lambdas!.publicUrl,
      fetcher
    })

    return lambdasClient
  }

  return {
    getAbout,
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
    const about = await client.getAbout(0)

    if (about.healthy) {
      return client
    }
  }

  return undefined
}
