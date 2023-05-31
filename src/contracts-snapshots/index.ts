import { cache } from './data'
import { CatalystServerInfo, L1Network } from '@dcl/catalyst-contracts'

export function getCatalystServersFromCache(network: L1Network): CatalystServerInfo[] {
  return cache.catalysts[network]
}

export function getNameDenylistFromCache(network: 'mainnet'): string[] {
  return cache.nameDenylist[network]
}

export function getPoisFromCache(network: 'polygon' | 'mumbai'): string[] {
  return cache.pois[network]
}
