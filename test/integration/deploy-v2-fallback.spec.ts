import * as http from 'http'
import { createContentClient } from '../../src'
import busboy from 'busboy'
import fetch from 'cross-fetch'

/** A "legacy" server that ONLY supports v1 — returns 404 for anything else. */
function startLegacyServer(): Promise<{ url: string; close: () => Promise<void>; received: () => boolean }> {
  let v1Hit = false
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(404).end()
        return
      }
      if (req.method === 'GET' && req.url?.startsWith('/available-content')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify([]))
        return
      }
      if (req.method === 'POST' && req.url === '/entities') {
        const bb = busboy({ headers: req.headers })
        bb.on('file', (_n, s) => s.resume())
        bb.on('finish', () => {
          v1Hit = true
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
        req.pipe(bb)
        return
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as any
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r, j) => server.close((e) => (e ? j(e) : r()))),
        received: () => v1Hit
      })
    })
  })
}

describe('deploy auto-fallback', () => {
  let legacy: Awaited<ReturnType<typeof startLegacyServer>>
  beforeEach(async () => { legacy = await startLegacyServer() })
  afterEach(async () => { await legacy.close() })

  it('uses v1 when probe returns 404 (auto)', async () => {
    const fetcher = { fetch: (url: any, init: any) => fetch(url, init) as any }
    const client = createContentClient({ url: legacy.url, fetcher: fetcher as any })

    const files = new Map<string, Uint8Array>([
      ['QmE', Buffer.from('{}')]
    ])
    await client.deploy({ entityId: 'QmE', authChain: [], files }, {} as any)

    expect(legacy.received()).toBe(true)
  })
})
