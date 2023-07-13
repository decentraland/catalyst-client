import { ContentClient, createContentClient } from './ContentClient'
import { LambdasClient, createLambdasClient } from './LambdasClient'
import { About } from './specs/catalyst.schemas'
import { ClientOptions } from './types'
import { sanitizeUrl } from './utils/Helper'

export type CatalystClient = {
  isCatalystUp(): Promise<boolean>
  fetchAbout(): Promise<About>
  getContentClient(): Promise<ContentClient>
  getLambdasClient(): Promise<LambdasClient>
}

export function createCatalystClient(options: ClientOptions): CatalystClient {
  const catalystUrl = sanitizeUrl(options.url)
  const { fetcher } = options

  let contentClient: undefined | ContentClient = undefined
  let lambdasClient: undefined | LambdasClient = undefined
  let about: About | undefined = undefined

  async function isCatalystUp(): Promise<boolean> {
    try {
      if (!about) {
        about = await fetchAbout()
      }

      const result = await fetcher.fetch(`${about.lambdas.publicUrl}/health`)
      const isSomeServiceDown = Object.keys(result).some((service) => result[service] !== 'Healthy')

      return !isSomeServiceDown
    } catch {
      return false
    }
  }

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
    isCatalystUp,
    fetchAbout,
    getContentClient,
    getLambdasClient
  }
}
