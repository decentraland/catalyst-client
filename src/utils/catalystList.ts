import { getMainnetCatalysts, getRopstenCatalysts } from 'dcl-catalyst-commons'
import { CatalystClient } from '../CatalystClient'
import CatalystsList from '../CatalystsList'
import { shuffleArray } from './common'

export async function getApprovedListFromContract(network: 'mainnet' | 'ropsten'): Promise<string[]> {
  const servers = network === 'mainnet' ? await getMainnetCatalysts() : await getRopstenCatalysts()
  return servers.map(({ address }) => address)
}

/**
 * The idea here is to build an updated list of the catalysts approved by the DAO, without actually querying the DAO's contract
 * directly. This is because that query is both slow and expensive, so the idea is to use a list of known servers and ask them
 * for the updated list. The thing is this known server list might be outdated, so we need to take that into account. We will
 * take N (defined by REQUIRED_LISTS below) random servers from this known list, and ask them for the currently approved ones. We will then use the intersection of those
 * N lists as the updated list.
 */
const REQUIRED_LISTS = 3
export type KnownServersOptions = {
  preKnownServers: { list: { address: string }[] } | { network: 'mainnet' | 'ropsten' }
  proofOfWorkEnabled?: boolean
  requiredLists?: number
  fetchApprovedCatalysts?: (catalystUrl: string) => Promise<string[] | undefined>
}
export async function getUpdatedApprovedListWithoutQueryingContract(
  options: KnownServersOptions
): Promise<string[] | undefined> {
  // Set defaults if needed
  const catalystListFetch =
    options.fetchApprovedCatalysts ??
    ((catalystUrl) => fetchCatalystsApprovedByDAO(catalystUrl, options.proofOfWorkEnabled))
  const requiredAmountOfLists = options.requiredLists ?? REQUIRED_LISTS

  // Get the list of known servers
  const knownServers =
    'list' in options.preKnownServers ? options.preKnownServers.list : CatalystsList[options.preKnownServers.network]

  // If I don't know enough servers, then it doesn't make sense to continue
  if (knownServers.length < requiredAmountOfLists) {
    return undefined
  }

  // Shuffle the list
  const shuffledPreKnownServers = shuffleArray(knownServers)

  // Ask N of them for their list
  const approvedServersList = await Promise.all(
    shuffledPreKnownServers
      .slice(0, requiredAmountOfLists + 3)
      .map((server) => server.address)
      .map((address) => catalystListFetch(address))
  )

  // Removed any failures
  const allLists: string[][] = approvedServersList.filter(
    (approvedServerList): approvedServerList is string[] => !!approvedServerList
  )

  // Check if we need to ask for anyone else's list
  let i = requiredAmountOfLists + 3
  while (i < shuffledPreKnownServers.length && allLists.length < requiredAmountOfLists) {
    const list = await catalystListFetch(shuffledPreKnownServers[i].address)
    if (list) {
      allLists.push(list)
    }
    i++
  }

  // If I didn't manage to get al least N lists from different sources, then abort
  if (allLists.length < requiredAmountOfLists) {
    return undefined
  }

  // Calculate the intersection
  const intersection = calculateIntersection(allLists)

  return intersection.length > 0 ? intersection : undefined
}

function calculateIntersection(lists: string[][]): string[] {
  const count: Map<string, number> = new Map()
  for (const list of lists) {
    for (const element of list) {
      count.set(element, (count.get(element) ?? 0) + 1)
    }
  }

  return Array.from(count.entries())
    .filter(([_, count]) => count === lists.length)
    .map(([element]) => element)
}

async function fetchCatalystsApprovedByDAO(
  catalystUrl: string,
  proofOfWorkEnabled?: boolean
): Promise<string[] | undefined> {
  const client: CatalystClient = new CatalystClient({
    catalystUrl,
    proofOfWorkEnabled
  })
  try {
    const servers = await client.fetchCatalystsApprovedByDAO({ timeout: '10s' })
    return servers.map(({ address }) => address)
  } catch {
    return undefined
  }
}
