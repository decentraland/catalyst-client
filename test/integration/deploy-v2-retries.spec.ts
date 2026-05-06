import { createContentClient } from '../../src'
import { startMockContentServer, MockServer } from './mock-content-server'
import fetch from 'cross-fetch'

describe('deploy v2 — retries', () => {
  let server: MockServer
  beforeEach(async () => { server = await startMockContentServer() })
  afterEach(async () => { await server.close() })

  it('succeeds after intermittent 503', async () => {
    server.setMissingFiles(['QmA'])
    server.failNextFile(503)
    const fetcher = { fetch: (url: any, init: any) => fetch(url, init) as any }
    const client = createContentClient({ url: server.url, fetcher: fetcher as any })

    const files = new Map<string, Uint8Array>([
      ['QmEntity', Buffer.from('{}')],
      ['QmA', new Uint8Array([1])]
    ])

    await client.deploy(
      { entityId: 'QmEntity', authChain: [], files },
      { deploymentProtocolVersion: 'v2' as const, retries: 3, retryBaseDelayMs: 10 } as any
    )

    expect(server.receivedFiles().get('QmA')).toBeDefined()
    expect(server.receivedFinalize()).toBe(true)
  })

  it('throws FileUploadError on 422 (no retry)', async () => {
    server.setMissingFiles(['QmA'])
    server.failNextFile(422)
    const fetcher = { fetch: (url: any, init: any) => fetch(url, init) as any }
    const client = createContentClient({ url: server.url, fetcher: fetcher as any })

    const files = new Map<string, Uint8Array>([
      ['QmEntity', Buffer.from('{}')],
      ['QmA', new Uint8Array([1])]
    ])

    await expect(
      client.deploy(
        { entityId: 'QmEntity', authChain: [], files },
        { deploymentProtocolVersion: 'v2' as const, retries: 3 } as any
      )
    ).rejects.toMatchObject({ name: 'FileUploadError', httpStatus: 422 })

    expect(server.receivedFinalize()).toBe(false)
  })
})
