import { HealthStatus } from 'dcl-catalyst-commons'
import { CatalystClient } from '../CatalystClient'
import { getApprovedListFromContract, getUpdatedApprovedListWithoutQueryingContract } from './catalystList'
import { shuffleArray } from './common'

/**
 * Returns a CatalystClient connected to one of the catalysts in the given network
 */
export async function clientConnectedToCatalystIn(
  network: 'mainnet' | 'ropsten',
  origin: string
): Promise<CatalystClient> {
  const noContractList = await getUpdatedApprovedListWithoutQueryingContract({
    preKnownServers: { network },
    origin
  })

  let list: string[]
  if (noContractList) {
    list = noContractList
  } else {
    console.warn('Falling back to the smart contract to get an updated list of active servers')
    list = await getApprovedListFromContract(network)
  }

  const shuffled = shuffleArray(list)

  for (const catalystUrl of shuffled) {
    const client = new CatalystClient(catalystUrl, origin)

    const isUp = await isServerUp(client)
    if (isUp) {
      return client
    }
  }

  throw new Error(`Couldn't find a server on the ${network} network that was up`)
}

async function isServerUp(client: CatalystClient): Promise<boolean> {
  try {
    const result = await client.fetchPeerHealth()
    const isSomeServerDown = Object.keys(result).some((service) => result[service] !== HealthStatus.HEALTHY)

    return !isSomeServerDown
  } catch {
    return false
  }
}
