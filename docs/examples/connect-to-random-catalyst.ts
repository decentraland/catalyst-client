import { connectedToRandomCatalyst } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from './../dist/cache/cache'
import { createFetchComponent } from './../dist/client/utils/fetcher'

async function run() {
  // Connect to a catalyst randomly choosen from the catalyst-client snapshot
  const fetcher = createFetchComponent()
  const nodes = getCatalystServersFromCache('mainnet')
  const catalyst = await connectedToRandomCatalyst(nodes, { fetcher })
  const catalystInfo = await catalyst?.getAbout(100)
  const contentClient = await catalyst?.getContentClient()
  const lambdasClient = await catalyst?.getLambdasClient()

  return { catalystInfo, contentClient, lambdasClient }
}

run()
