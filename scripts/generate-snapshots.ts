import RequestManager, { ContractFactory, HTTPProvider, bytesToHex } from 'eth-connect'
import fs from 'fs'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { getCatalystServersFromDAO, getNameDenylistFromContract, getPoiFromContract } from '../src/contracts'
import {
  catalystAbi,
  CatalystByIdResult,
  CatalystContract,
  l1Contracts,
  l2Contracts,
  listAbi,
  NameDenylistContract,
  PoiContract
} from '@dcl/catalyst-contracts'

async function main(): Promise<void> {
  console.log('Updating cache')

  const fetch = createFetchComponent()

  const opts = { fetch: fetch.fetch }
  const providers = {
    mainnet: new HTTPProvider('https://rpc.decentraland.org/mainnet?project:catalyst-client-build', opts),
    goerli: new HTTPProvider('https://rpc.decentraland.org/goerli?project:catalyst-client-build', opts),
    polygon: new HTTPProvider('https://rpc.decentraland.org/polygon?project:catalyst-client-build', opts),
    mumbai: new HTTPProvider('https://rpc.decentraland.org/mumbai?project:catalyst-client-build', opts)
  }

  async function getDenylists() {
    async function createContract(address: string, provider: HTTPProvider): Promise<NameDenylistContract> {
      const requestManager = new RequestManager(provider)
      const factory = new ContractFactory(requestManager, listAbi)
      return (await factory.at(address)) as any
    }

    const [mainnet, goerli] = await Promise.all([
      getNameDenylistFromContract(await createContract(l1Contracts.mainnet.nameDenylist, providers.mainnet)),
      getNameDenylistFromContract(await createContract(l1Contracts.goerli.nameDenylist, providers.goerli))
    ])
    return { mainnet, goerli }
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

    const [mainnet, goerli] = await Promise.all([
      getCatalystServersFromDAO(await createContract(l1Contracts.mainnet.catalyst, providers.mainnet)),
      getCatalystServersFromDAO(await createContract(l1Contracts.goerli.catalyst, providers.goerli))
    ])
    return { mainnet, goerli }
  }

  async function getPois() {
    async function createContract(address: string, provider: HTTPProvider): Promise<PoiContract> {
      const requestManager = new RequestManager(provider)
      const factory = new ContractFactory(requestManager, listAbi)
      return (await factory.at(address)) as any
    }
    const [polygon, mumbai] = await Promise.all([
      getPoiFromContract(await createContract(l2Contracts.polygon.poi, providers.polygon)),
      getPoiFromContract(await createContract(l2Contracts.mumbai.poi, providers.mumbai))
    ])
    return { polygon, mumbai }
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
