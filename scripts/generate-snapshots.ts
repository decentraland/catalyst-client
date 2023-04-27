import { JsonRpcProvider } from 'ethers'
import fs from 'fs'
import { getCatalystServersFromDAO, getNameDenylistFromContract, getPoiFromContract } from '../src/contracts/web3'

async function main(): Promise<void> {
  console.log('Updating cache')

  const providers = {
    mainnet: new JsonRpcProvider('https://rpc.decentraland.org/mainnet?project=catalyst-client-build'),
    goerli: new JsonRpcProvider('https://rpc.decentraland.org/goerli?project=catalyst-client-build'),
    polygon: new JsonRpcProvider('https://rpc.decentraland.org/polygon?project=catalyst-client-build'),
    mumbai: new JsonRpcProvider('https://rpc.decentraland.org/mumbai?project=catalyst-client-build')
  }

  async function getDenylists() {
    const [mainnet] = await Promise.all([getNameDenylistFromContract('mainnet', providers.mainnet)])
    return { mainnet }
  }

  async function getCatalysts() {
    const [mainnet, goerli] = await Promise.all([
      getCatalystServersFromDAO('mainnet', providers.mainnet),
      getCatalystServersFromDAO('goerli', providers.goerli)
    ])
    return { mainnet, goerli }
  }

  async function getPois() {
    const [polygon, mumbai] = await Promise.all([
      getPoiFromContract('polygon', providers.polygon),
      getPoiFromContract('mumbai', providers.mumbai)
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
