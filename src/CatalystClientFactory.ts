import { Fetcher } from 'dcl-catalyst-commons'
import { CatalystClient } from './CatalystClient'
import { ContentClient } from './ContentClient'
import { LambdasClient } from './LambdasClient'
import { DeploymentBuilder } from './utils'
import { getHeadersWithUserAgent, sanitizeUrl } from './utils/Helper'

export type CatalystClientOptions = {
  catalystUrl: string
  origin: string // The name or a description of the app that is using the client
  proofOfWorkEnabled: boolean
  fetcher?: Fetcher
  deploymentBuilderClass?: typeof DeploymentBuilder
}

export async function createCatalystClient(options: CatalystClientOptions): Promise<CatalystClient> {
  const catalystUrl = sanitizeUrl(options.catalystUrl)
  const fetcherToUse: Fetcher = options.fetcher ?? new Fetcher({ headers: getHeadersWithUserAgent('catalyst-client') })

  const contentClient = new ContentClient({
    contentUrl: catalystUrl + '/content',
    origin: options.origin,
    proofOfWorkEnabled: options.proofOfWorkEnabled,
    fetcher: fetcherToUse,
    deploymentBuilderClass: options.deploymentBuilderClass
  })

  const lambdasClient = new LambdasClient({
    lambdasUrl: catalystUrl + '/lambdas',
    proofOfWorkEnabled: options.proofOfWorkEnabled,
    fetcher: fetcherToUse
  })

  return new CatalystClient(catalystUrl, contentClient, lambdasClient)
}
