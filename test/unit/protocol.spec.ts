import { probeServerSupportsV2 } from '../../src/client/protocol'

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
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/entities/QmX/status',
      expect.anything()
    )
  })
})
