/* eslint-disable @typescript-eslint/no-unused-vars */
import { ContentClient, createContentClient } from '../src'

describe('test client post', () => {
  let client: ContentClient
  let mockFetch: jest.Mock

  beforeEach(() => {
    mockFetch = jest.fn()
    const mockFetcher = { fetch: mockFetch }

    client = createContentClient({
      url: 'http://fake-url.com',
      fetcher: mockFetcher
    })
  })

  it('publishes an entity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { cid: 'QmA', available: true },
        { cid: 'QmB', available: true }
      ]
    })

    const files = new Map<string, Uint8Array>()
    files.set('QmA', new Uint8Array([111, 112, 113]))
    files.set('QmB', Buffer.from('asd', 'utf-8'))

    await client.deploy({ authChain: [], entityId: 'QmENTITY', files })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [_checkAvailabilityCall, deployCall] = mockFetch.mock.calls
    expect(deployCall[0]).toContain('/entities')
    expect(deployCall[1].method).toBe('POST')
  })
})
