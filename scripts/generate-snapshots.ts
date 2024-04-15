import {
  catalystAbi,
  CatalystByIdResult,
  CatalystContract,
  CatalystServerInfo,
  getCatalystServersFromDAO,
  getNameDenylistFromContract,
  getPoisFromContract,
  l1Contracts,
  l2Contracts,
  listAbi,
  NameDenylistContract,
  PoiContract
} from '@dcl/catalyst-contracts'
import { createFetchComponent } from '@well-known-components/fetch-component'
import RequestManager, { bytesToHex, ContractFactory, HTTPProvider } from 'eth-connect'
import fs from 'fs'

function moveInterconnectedCatalystToEnd(catalysts: CatalystServerInfo[]): CatalystServerInfo[] {
  const interconnected = catalysts.find((server) =>
    server.address.toLocaleLowerCase().includes('interconnected.online')
  )
  if (interconnected) {
    const index = catalysts.indexOf(interconnected)
    catalysts.splice(index, 1)
    catalysts.push(interconnected)
  }
  return catalysts
}

async function main(): Promise<void> {
  console.log('Updating cache')

  const fetch = createFetchComponent()

  const opts = { fetch: fetch.fetch }
  const providers = {
    mainnet: new HTTPProvider('https://rpc.decentraland.org/mainnet?project:catalyst-client-build', opts),
    sepolia: new HTTPProvider('https://rpc.decentraland.org/sepolia?project:catalyst-client-build', opts),
    polygon: new HTTPProvider('https://rpc.decentraland.org/polygon?project:catalyst-client-build', opts),
    amoy: new HTTPProvider('https://rpc.decentraland.org/amoy?project:catalyst-client-build', opts)
  }

  async function getDenylists() {
    async function createContract(address: string, provider: HTTPProvider): Promise<NameDenylistContract> {
      const requestManager = new RequestManager(provider)
      const factory = new ContractFactory(requestManager, listAbi)
      return (await factory.at(address)) as any
    }

    const [mainnet, sepolia] = await Promise.all([
      getNameDenylistFromContract(await createContract(l1Contracts.mainnet.nameDenylist, providers.mainnet)),
      getNameDenylistFromContract(await createContract(l1Contracts.sepolia.nameDenylist, providers.sepolia))
    ])
    return { mainnet, sepolia }
  }

  async function getCatalysts() {
    async function createContract(address: string, provider: HTTPProvider): Promise<CatalystContract> {
      const requestManager = new RequestManager(provider)
      const factory = new ContractFactory(requestManager, catalystAbi)
      const contract = (await factory.at(address)) as any
      return {
        async catalystCount(): Promise<number> {
          return contract.catalystCount()
        },
        async catalystIds(i: number): Promise<string> {
          return contract.catalystIds(i)
        },
        async catalystById(catalystId: string): Promise<CatalystByIdResult> {
          const [id, owner, domain] = await contract.catalystById(catalystId)
          return { id: '0x' + bytesToHex(id), owner, domain }
        }
      }
    }

    const [mainnet, sepolia] = await Promise.all([
      getCatalystServersFromDAO(await createContract(l1Contracts.mainnet.catalyst, providers.mainnet)),
      getCatalystServersFromDAO(await createContract(l1Contracts.sepolia.catalyst, providers.sepolia))
    ])

    return { mainnet: moveInterconnectedCatalystToEnd(mainnet), sepolia }
  }

  async function getPois() {
    async function createContract(address: string, provider: HTTPProvider): Promise<PoiContract> {
      const requestManager = new RequestManager(provider)
      const factory = new ContractFactory(requestManager, listAbi)
      return (await factory.at(address)) as any
    }
    const [polygon, amoy] = await Promise.all([
      getPoisFromContract(await createContract(l2Contracts.polygon.poi, providers.polygon)),
      getPoisFromContract(await createContract(l2Contracts.amoy.poi, providers.amoy))
    ])
    return { polygon, amoy }
  }

  const content = {
    catalysts: await getCatalysts(),
    nameDenylist: await getDenylists(),
    pois: await getPois()
  }

  const s = `export const cache = ${JSON.stringify(content, null, 4)}`

  await fs.promises.writeFile('src/contracts-snapshots/data.ts', Buffer.from(s))

  console.log('Cache updated')
}

main().catch((error) => console.error('Failed to update the catalyst list', error))
