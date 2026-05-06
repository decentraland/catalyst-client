import { probeServerSupportsV2, createProbeCache, resolveProtocol } from '../../src/client/protocol'
import { ProtocolUnsupportedError } from '../../src/client/errors'

function fakeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('probeServerSupportsV2', () => {
  it('returns true for HTTP 200 on OPTIONS', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))
    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/entities/QmX/status',
      expect.objectContaining({ method: 'OPTIONS' })
    )
  })

  it('returns true for HTTP 204', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 })
    expect(await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))).toBe(true)
  })

  it('returns false for HTTP 404', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    expect(await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))).toBe(false)
  })

  it('returns false for any 4xx other than 405', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 })
    expect(await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))).toBe(false)
  })

  it('returns true for HTTP 405 (method-not-allowed but route exists)', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 405 })
    expect(await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))).toBe(true)
  })

  it('returns false on network error', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('econnrefused'))
    expect(await probeServerSupportsV2('https://example.com', 'QmX', fakeFetcher(fetch))).toBe(false)
  })

  it('strips trailing slash from serverUrl', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    await probeServerSupportsV2('https://example.com/', 'QmX', fakeFetcher(fetch))
    expect(fetch).toHaveBeenCalledWith('https://example.com/entities/QmX/status', expect.anything())
  })
})

describe('createProbeCache', () => {
  it('caches per serverUrl', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const cache = createProbeCache({ fetch } as any)
    const a1 = await cache.supportsV2('https://a.com', 'QmA')
    const a2 = await cache.supportsV2('https://a.com', 'QmA')
    const b1 = await cache.supportsV2('https://b.com', 'QmB')
    expect(a1).toBe(true)
    expect(a2).toBe(true)
    expect(b1).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2) // one per unique serverUrl, NOT per call
  })

  it('treats trailing-slash variants as the same server', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    const cache = createProbeCache({ fetch } as any)
    await cache.supportsV2('https://a.com', 'QmA')
    await cache.supportsV2('https://a.com/', 'QmA')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('caches negative results too', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    const cache = createProbeCache({ fetch } as any)
    expect(await cache.supportsV2('https://legacy.com', 'QmA')).toBe(false)
    expect(await cache.supportsV2('https://legacy.com', 'QmA')).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('resolveProtocol', () => {
  function probeReturning(supports: boolean) {
    return { supportsV2: jest.fn().mockResolvedValue(supports) } as any
  }

  it("returns 'v1' when explicit", async () => {
    const probe = probeReturning(true)
    expect(await resolveProtocol('https://example.com', 'v1', probe, async () => 'QmX')).toBe('v1')
    expect(probe.supportsV2).not.toHaveBeenCalled()
  })

  it("returns 'v2' when explicit and server supports it", async () => {
    expect(await resolveProtocol('https://example.com', 'v2', probeReturning(true), async () => 'QmX')).toBe('v2')
  })

  it("throws ProtocolUnsupportedError when 'v2' explicit but server is legacy", async () => {
    await expect(
      resolveProtocol('https://example.com', 'v2', probeReturning(false), async () => 'QmX')
    ).rejects.toBeInstanceOf(ProtocolUnsupportedError)
  })

  it("auto: returns 'v2' when supported", async () => {
    expect(await resolveProtocol('https://example.com', 'auto', probeReturning(true), async () => 'QmX')).toBe('v2')
  })

  it("auto: returns 'v1' when not supported", async () => {
    expect(await resolveProtocol('https://example.com', 'auto', probeReturning(false), async () => 'QmX')).toBe('v1')
  })

  it("treats undefined as 'auto'", async () => {
    expect(await resolveProtocol('https://example.com', undefined, probeReturning(true), async () => 'QmX')).toBe('v2')
  })
})
