import { CatalystServerInfo } from '..//types'
import { cache } from './data'
import { Network } from './types'

export function getCatalystServersFromCache(network: Network): CatalystServerInfo[] {
  return cache.catalysts[network]
}

export function getNameDenylistFromCache(network: Network): string[] {
  return cache.nameDenylist[network]
}

export function getPoiFromCache(network: 'polygon' | 'mumbai'): string[] {
  return cache.pois[network]
}
