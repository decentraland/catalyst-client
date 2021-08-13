import { HealthStatus } from 'dcl-catalyst-commons'
import { CatalystClient, CatalystConnectOptions } from '../CatalystClient'
import { getApprovedListFromContract, getUpdatedApprovedListWithoutQueryingContract } from './catalystList'
import { shuffleArray } from './common'

const FETCH_HEALTH_TIMEOUT = '10s'

/**
 * Returns a CatalystClient connected to one of the catalysts in the given network
 */
export async function clientConnectedToCatalystIn(options: CatalystConnectOptions): Promise<CatalystClient> {
  const noContractList = await getUpdatedApprovedListWithoutQueryingContract({
    preKnownServers: { network: options.network },
    proofOfWorkEnabled: options.proofOfWorkEnabled
  })

  let list: string[]
  if (noContractList) {
    list = noContractList
  } else {
    console.warn('Falling back to the smart contract to get an updated list of active servers')
    list = await getApprovedListFromContract(options.network)
  }

  const shuffled = shuffleArray(list)

  for (const catalystUrl of shuffled) {
    const client = new CatalystClient({
      catalystUrl: catalystUrl,
      proofOfWorkEnabled: options.proofOfWorkEnabled
    })

    const isUp = await isServerUp(client)
    if (isUp) {
      return client
    }
  }

  throw new Error(`Couldn't find a server on the ${options.network} network that was up`)
}

async function isServerUp(client: CatalystClient): Promise<boolean> {
  try {
    const result = await client.fetchPeerHealth({ timeout: FETCH_HEALTH_TIMEOUT })
    const isSomeServerDown = Object.keys(result).some((service) => result[service] !== HealthStatus.HEALTHY)

    return !isSomeServerDown
  } catch {
    return false
  }
}
