import { IFetchComponent } from '@well-known-components/interfaces'
import { sanitizeUrl } from './utils/Helper'

/**
 * Probes whether `serverUrl` exposes the v2 deploy protocol.
 *
 * Sends `OPTIONS /entities/{probeEntityId}/status`. The server's HTTP router will
 * respond with 200/204 (route registered) or 405 (route registered, OPTIONS not
 * explicitly allowed but the path matches) on v2-aware servers. Legacy servers
 * return 404 for the unknown path.
 */
export async function probeServerSupportsV2(
  serverUrl: string,
  probeEntityId: string,
  fetcher: IFetchComponent
): Promise<boolean> {
  const url = `${sanitizeUrl(serverUrl)}/entities/${probeEntityId}/status`
  try {
    const resp = await fetcher.fetch(url, { method: 'OPTIONS' })
    // 200/204 -> route exists; 405 -> route exists but OPTIONS not allowed (still v2-aware)
    return resp.status === 200 || resp.status === 204 || resp.status === 405
  } catch {
    return false
  }
}

export type ProbeCache = {
  supportsV2(serverUrl: string, probeEntityId: string): Promise<boolean>
}

export function createProbeCache(fetcher: IFetchComponent): ProbeCache {
  const cache = new Map<string, Promise<boolean>>()
  return {
    supportsV2(serverUrl, probeEntityId) {
      const key = sanitizeUrl(serverUrl)
      const existing = cache.get(key)
      if (existing) return existing
      const promise = probeServerSupportsV2(key, probeEntityId, fetcher)
      cache.set(key, promise)
      return promise
    }
  }
}
