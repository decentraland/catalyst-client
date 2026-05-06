import { IFetchComponent } from '@well-known-components/interfaces'
import { sanitizeUrl } from './utils/Helper'
import { ProtocolUnsupportedError } from './errors'
import { DeploymentProtocolVersion } from './types'

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
  fetcher: IFetchComponent,
  timeoutMs: number = 5000
): Promise<boolean> {
  const url = `${sanitizeUrl(serverUrl)}/entities/${probeEntityId}/status`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetcher.fetch(url, { method: 'OPTIONS', signal: ctrl.signal as any })
    // 200/204 -> route exists; 405 -> route exists but OPTIONS not allowed (still v2-aware)
    return resp.status === 200 || resp.status === 204 || resp.status === 405
  } catch {
    return false
  } finally {
    clearTimeout(timer)
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

export type ResolvedProtocol = 'v1' | 'v2'

export async function resolveProtocol(
  serverUrl: string,
  requested: DeploymentProtocolVersion | undefined,
  probe: ProbeCache,
  resolveProbeId: (serverUrl: string) => Promise<string>
): Promise<ResolvedProtocol> {
  const choice = requested ?? 'auto'
  if (choice === 'v1') return 'v1'

  const probeId = await resolveProbeId(serverUrl)
  const supported = await probe.supportsV2(serverUrl, probeId)

  if (choice === 'v2') {
    if (!supported) throw new ProtocolUnsupportedError(serverUrl)
    return 'v2'
  }
  // 'auto'
  return supported ? 'v2' : 'v1'
}
