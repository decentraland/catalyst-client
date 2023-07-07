import { sanitizeUrl } from './utils/Helper'
import { ClientOptions } from './types'
import { CustomClient } from './utils/fetcher'
import * as client from './specs/lambdas-client'

export type LambdasClient = ReturnType<typeof createLambdasClient>

export function createLambdasClient(options: ClientOptions) {
  const lambdasUrl = sanitizeUrl(options.url)

  function wrap<T extends (...args: any) => CustomClient<any>>(f: T) {
    return (...args: Parameters<T>): ReturnType<ReturnType<T>> => {
      return f(...(args as any))(lambdasUrl, options.fetcher) as any
    }
  }

  return {
    getLambdaStatus: wrap(client.getLambdaStatus),
    getCollections: wrap(client.getCollections),
    getThumbnail: wrap(client.getThumbnail),
    getImage: wrap(client.getImage),
    getStandardErc721: wrap(client.getStandardErc721),
    getWearables: wrap(client.getWearables),
    getEmotes: wrap(client.getEmotes),
    getNames: wrap(client.getNames),
    getLands: wrap(client.getLands),
    getThirdPartyWearables: wrap(client.getThirdPartyWearables),
    getThirdPartyCollection: wrap(client.getThirdPartyCollection),
    getHotScenes: wrap(client.getHotScenes),
    getRealms: wrap(client.getRealms),
    getAvatarsDetailsByPost: wrap(client.getAvatarsDetailsByPost),
    getAvatarDetails: wrap(client.getAvatarDetails),
    getThirdPartyIntegrations: wrap(client.getThirdPartyIntegrations)
  }
}
