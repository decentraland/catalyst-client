import { CatalystServerInfo, L1Network } from '@dcl/catalyst-contracts'
import { cache } from './data'

export function getCatalystServersFromCache(network: L1Network): CatalystServerInfo[] {
  return cache.catalysts[network]
}

export function getNameDenylistFromCache(network: 'mainnet'): string[] {
  return cache.nameDenylist[network]
}

export function getPoisFromCache(network: 'polygon' | 'amoy'): string[] {
  return cache.pois[network]
}
