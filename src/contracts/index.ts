import * as ethers from 'ethers'
import { Provider } from 'ethers'
import * as contracts from '@dcl/catalyst-contracts'

export async function getCatalystServersFromDAO(
  network: contracts.L1Network,
  provider: Provider
): Promise<contracts.CatalystServerInfo[]> {
  const contract = new ethers.Contract(contracts.l1Contracts[network].catalyst, contracts.catalystAbi, provider)
  return contracts.getCatalystServersFromDAO({
    async catalystCount(): Promise<number> {
      return contract.catalystCount()
    },
    async catalystIds(i: number): Promise<string> {
      return contract.catalystIds(i)
    },
    async catalystById(catalystId: string): Promise<contracts.CatalystByIdResult> {
      const [id, owner, domain] = await contract.catalystById(catalystId)
      return { id, owner, domain }
    }
  })
}

export async function getPoiFromContract(network: contracts.L2Network, provider: Provider): Promise<string[]> {
  const contract = new ethers.Contract(contracts.l2Contracts[network].poi, contracts.listAbi, provider)
  return contracts.getPoisFromContract(contract as any as contracts.PoiContract)
}

export async function getNameDenylistFromContract(network: 'mainnet', provider: Provider): Promise<string[]> {
  const contract = new ethers.Contract(contracts.l1Contracts[network].nameDenylist, contracts.listAbi, provider)
  return contracts.getNameDenylistFromContract(contract as any as contracts.NameDenylistContract)
}
