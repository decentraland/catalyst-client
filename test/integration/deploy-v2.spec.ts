import { createContentClient } from '../../src'
import { startMockContentServer, MockServer } from './mock-content-server'
import fetch from 'cross-fetch'

describe('deploy v2 — happy path', () => {
  let server: MockServer
  beforeEach(async () => { server = await startMockContentServer() })
  afterEach(async () => { await server.close() })

  it('completes init -> upload all -> finalize', async () => {
    server.setMissingFiles(['QmA', 'QmB'])
    const fetcher = { fetch: (url: any, init: any) => fetch(url, init) as any }
    const client = createContentClient({ url: server.url, fetcher: fetcher as any })

    const files = new Map<string, Uint8Array>([
      ['QmEntity', Buffer.from('{"x":1}')],
      ['QmA', new Uint8Array([1, 2, 3])],
      ['QmB', new Uint8Array([4, 5, 6, 7])]
    ])

    const result: any = await client.deploy(
      { entityId: 'QmEntity', authChain: [], files },
      { deploymentProtocolVersion: 'v2' as const }
    )

    expect(result.status).toBe(200)
    expect(server.receivedFinalize()).toBe(true)
    const got = server.receivedFiles()
    expect(got.get('QmA')).toEqual(Buffer.from([1, 2, 3]))
    expect(got.get('QmB')).toEqual(Buffer.from([4, 5, 6, 7]))
    expect(server.receivedToken()).toBe('tok-mock')
  })
})
