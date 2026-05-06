import { resolveProbeEntityId } from '../../src/client/probe-entity-id'

function fakeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('resolveProbeEntityId', () => {
  it('returns a hardcoded fallback when /about is unreachable', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('econnrefused'))
    const id = await resolveProbeEntityId('https://example.com', fakeFetcher(fetch))
    expect(id).toBe('bafkreig5oqsdgjbcl6avgegwacw5kywuhyqcnlc5e5pftn4hi5w7v6gyme')
  })

  it('returns hardcoded fallback for unknown server shape', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const id = await resolveProbeEntityId('https://catalyst.example.com', fakeFetcher(fetch))
    expect(id).toBe('bafkreig5oqsdgjbcl6avgegwacw5kywuhyqcnlc5e5pftn4hi5w7v6gyme')
  })
})
