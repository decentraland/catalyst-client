import { Fetcher } from 'dcl-catalyst-commons'
import { CatalystClient } from './CatalystClient'
import { ContentClient } from './ContentClient'
import { LambdasClient } from './LambdasClient'
import { DeploymentBuilder } from './utils'
import { getHeadersWithUserAgent, sanitizeUrl } from './utils/Helper'

export async function createCatalystClient(
  catalystUrl: string,
  origin: string, // The name or a description of the app that is using the client
  fetcher?: Fetcher,
  deploymentBuilderClass?: typeof DeploymentBuilder
): Promise<CatalystClient> {
  catalystUrl = sanitizeUrl(catalystUrl)
  const fetcherToUse: Fetcher = fetcher ?? new Fetcher({ headers: getHeadersWithUserAgent('catalyst-client') })
  const contentClient = await ContentClient.createAsync(
    catalystUrl + '/content',
    origin,
    fetcherToUse,
    deploymentBuilderClass
  )
  const lambdasClient = await LambdasClient.CreateAsync(catalystUrl + '/lambdas', fetcherToUse)

  return new CatalystClient(catalystUrl, contentClient, lambdasClient)
}
