import { getMainnetCatalysts, getRopstenCatalysts } from 'dcl-catalyst-commons'
import { CatalystClient } from '../CatalystClient'
import CatalystsList from '../CatalystsList'

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
    console.warn('Falling back to the smart contract')
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
    await Promise.all([client.fetchContentStatus(), client.fetchLambdasStatus()])
    return true
  } catch {
    return false
  }
}

async function getApprovedListFromContract(network: 'mainnet' | 'ropsten'): Promise<string[]> {
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
export async function getUpdatedApprovedListWithoutQueryingContract({
  preKnownServers,
  origin,
  requiredLists,
  fetchApprovedCatalysts
}: {
  preKnownServers: { list: { address: string }[] } | { network: 'mainnet' | 'ropsten' }
  origin: string
  requiredLists?: number
  fetchApprovedCatalysts?: (catalystUrl: string, origin: string) => Promise<string[] | undefined>
}): Promise<string[] | undefined> {
  // Set defaults if needed
  const catalystListFetch =
    fetchApprovedCatalysts ?? ((catalystUrl, origin) => fetchCatalystsApprovedByDAO(catalystUrl, origin))
  const requiredAmountOfLists = requiredLists ?? REQUIRED_LISTS

  // Get the list of known servers
  const knownServers = 'list' in preKnownServers ? preKnownServers.list : CatalystsList[preKnownServers.network]

  // If I don't know enough servers, then it doesn't make sense to continue
  if (knownServers.length < requiredAmountOfLists) {
    return undefined
  }

  // Shuffle the list
  const shuffledPreKnownServers = shuffleArray(knownServers)

  // Ask N of them for their list
  const approvedServersList = await Promise.all(
    shuffledPreKnownServers
      .slice(0, requiredAmountOfLists)
      .map((server) => server.address)
      .map((address) => catalystListFetch(address, origin))
  )

  // Removed any failures
  const allLists: string[][] = approvedServersList.filter(
    (approvedServerList): approvedServerList is string[] => !!approvedServerList
  )

  // Check if we need to ask for anyone else's list
  let i = requiredAmountOfLists
  while (i < shuffledPreKnownServers.length && allLists.length < requiredAmountOfLists) {
    const list = await catalystListFetch(shuffledPreKnownServers[i].address, origin)
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

async function fetchCatalystsApprovedByDAO(catalystUrl: string, origin: string): Promise<string[] | undefined> {
  const client = new CatalystClient(catalystUrl, origin)
  try {
    const servers = await client.fetchCatalystsApprovedByDAO({ timeout: '5s' })
    return servers.map(({ address }) => address)
  } catch {
    return undefined
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
