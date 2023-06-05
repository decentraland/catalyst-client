import { ClientOptions } from './types'
import { sanitizeUrl } from './utils/Helper'
import { createContentClient, ContentClient } from './ContentClient'
import { createLambdasClient, LambdasClient } from './LambdasClient'
import { About } from './specs/catalyst.schemas'

export type CatalystClient = {
  fetchAbout(): Promise<About>
  getContentClient(): Promise<ContentClient>
  getLambdasClient(): Promise<LambdasClient>
}

export async function createCatalystClient(options: ClientOptions): Promise<CatalystClient> {
  const catalystUrl = sanitizeUrl(options.url)
  const { fetcher } = options

  let contentClient: undefined | ContentClient = undefined
  let lambdasClient: undefined | LambdasClient = undefined
  let about: About | undefined = undefined

  async function fetchAbout(): Promise<About> {
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
