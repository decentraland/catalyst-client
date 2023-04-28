import * as ethers from 'ethers'
import { Provider } from 'ethers'
import { CatalystServerInfo } from '../types'
import { catalystAbi, listAbi } from './abi'
import { Network } from './types'

export const catalystContracts = {
  goerli: '0x380e46851c47b73b6aa9bea50cf3b50e2cf637cf',
  mainnet: '0x4a2f10076101650f40342885b99b6b101d83c486'
}

export const poiContracts = {
  mumbai: '0x08E5a5288D6bBa9383724C57175C03A37fe83A2A',
  polygon: '0xFEC09d5C192aaf7Ec7E2C89Cc8D3224138391B2E'
}

export const nameDenylistContracts = {
  goerli: '0x71c84760df0537f7db286274817462dc2e6c1366',
  mainnet: '0x0c4c90a4f29872a2e9ef4c4be3d419792bca9a36'
}

export async function getCatalystServersFromDAO(network: Network, provider: Provider): Promise<CatalystServerInfo[]> {
  const contract = new ethers.Contract(catalystContracts[network], catalystAbi, provider)

  const nodes: CatalystServerInfo[] = []
  for (let i = 0; i < (await contract.catalystCount()); i++) {
    const record = await contract.catalystById(await contract.catalystIds(i))
    const [id, owner, domain] = record
    if (domain.startsWith('http://')) {
      console.warn('Catalyst node address using http protocol, skipping')
      continue
    }

    let address = domain

    if (!address.startsWith('https://')) {
      address = 'https://' + address
    }

    // trim url in case it starts/ends with a blank
    address = address.trim()

    nodes.push({
      address,
      owner,
      id
    })
  }

  return nodes
}

export async function getPoiFromContract(network: 'polygon' | 'mumbai', provider: Provider): Promise<string[]> {
  const contract = new ethers.Contract(poiContracts[network], listAbi, provider)
  const count = await contract.size()

  const pois: Promise<string>[] = []
  for (let i = 0; i < count; i++) {
    pois.push(contract.get(i))
  }

  return Promise.all(pois)
}

export async function getNameDenylistFromContract(network: Network, provider: Provider): Promise<string[]> {
  const contract = new ethers.Contract(nameDenylistContracts[network], listAbi, provider)
  const count = await contract.size()

  const denylist: Promise<string>[] = []
  for (let i = 0; i < count; i++) {
    denylist.push(contract.get(i))
  }

  return Promise.all(denylist)
}
