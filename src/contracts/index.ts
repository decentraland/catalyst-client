import { CatalystContract, PoiContract, NameDenylistContract } from '@dcl/catalyst-contracts'
import * as contracts from '@dcl/catalyst-contracts'

export async function getCatalystServersFromDAO(contract: CatalystContract): Promise<contracts.CatalystServerInfo[]> {
  return contracts.getCatalystServersFromDAO(contract)
}

export async function getPoiFromContract(contract: PoiContract): Promise<string[]> {
  return contracts.getPoisFromContract(contract)
}

export async function getNameDenylistFromContract(contract: NameDenylistContract): Promise<string[]> {
  return contracts.getNameDenylistFromContract(contract)
}
