import { createContentClient } from '../../src'
import { startMockContentServer, MockServer } from './mock-content-server'
import fetch from 'cross-fetch'

describe('deploy v2 — eviction recovery', () => {
  let server: MockServer
  beforeEach(async () => { server = await startMockContentServer() })
  afterEach(async () => { await server.close() })

  it('reinitializes when server returns 404 mid-upload', async () => {
    server.setMissingFiles(['QmA', 'QmB'])
    server.forceEviction(2) // first 2 file uploads return 404

    const fetcher = { fetch: (url: any, init: any) => fetch(url, init) as any }
    const client = createContentClient({ url: server.url, fetcher: fetcher as any })

    const files = new Map<string, Uint8Array>([
      ['QmEntity', Buffer.from('{}')],
      ['QmA', new Uint8Array([1])],
      ['QmB', new Uint8Array([2])]
    ])
    await client.deploy(
      { entityId: 'QmEntity', authChain: [], files },
      { deploymentProtocolVersion: 'v2' as const, retries: 0 } as any
    )

    expect(server.receivedFinalize()).toBe(true)
    const got = server.receivedFiles()
    expect(got.get('QmA')).toBeDefined()
    expect(got.get('QmB')).toBeDefined()
  })
})
