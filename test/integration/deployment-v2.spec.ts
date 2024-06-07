import { createFetchComponent } from '@well-known-components/fetch-component'
import { ContentClient, createContentClient } from '../../src'
import { runServerBasedE2ETest } from '../components'

runServerBasedE2ETest('test deployment v2 protocol', ({ components }) => {
  let client: ContentClient
  let expectedFiles: Record<string, Uint8Array>

  beforeEach(async () => {
    expectedFiles = {
      bafkreiecsxue6isqiozm7kgrxd35qcmb5teulk6rwo6ux3b4mhvhyyoe6y: new Uint8Array([111, 112, 113]),
      bafkreidiq6d5r7yujricy72476vp4lgfrdmga6pz32edatbgwdfztturyy: Buffer.from('asd', 'utf-8')
    }

    components.router.get('/available-content', async (ctx) => {
      const params = new URLSearchParams(ctx.url.search)
      const cids = params.getAll('cid')

      return {
        status: 200,
        body: cids.map(($) => ({
          cid: $,
          available: false
        }))
      }
    })

    components.router.post('/v2/entities/:entityId', async (ctx) => {
      expect(ctx.params.entityId).toBe('QmENTITY')

      const body = await ctx.request.json()

      expect(body).toMatchObject({ authChain: [] })
      for (const [hash, file] of Object.entries(expectedFiles)) {
        expect(body.files).toHaveProperty(hash)
        expect(body.files[hash]).toBe(file.length)
      }

      return {
        status: 202, // Accepted
        body: {}
      }
    })

    components.router.options('/v2/entities/:entityId/files/:fileHash', async (ctx) => {
      return {
        status: 200
      }
    })

    components.router.post('/v2/entities/:entityId/files/:fileHash', async (ctx) => {
      expect(ctx.params.entityId).toBe('QmENTITY')
      expect(expectedFiles).toHaveProperty(ctx.params.fileHash)
      expect(Buffer.from(await ctx.request.arrayBuffer())).toEqual(Buffer.from(expectedFiles[ctx.params.fileHash]))

      return {
        status: 204
      }
    })

    components.router.put('/v2/entities/:entityId', async (ctx) => {
      expect(ctx.params.entityId).toBe('QmENTITY')

      return {
        status: 200,
        body: {
          creationTimestamp: Date.now()
        }
      }
    })

    client = createContentClient({
      url: await components.getBaseUrl(),
      fetcher: createFetchComponent()
    })
  })

  test('publishes an entity', async () => {
    const files = new Map<string, Uint8Array>()
    files.set('bafkreiecsxue6isqiozm7kgrxd35qcmb5teulk6rwo6ux3b4mhvhyyoe6y', new Uint8Array([111, 112, 113]))
    files.set('bafkreidiq6d5r7yujricy72476vp4lgfrdmga6pz32edatbgwdfztturyy', Buffer.from('asd', 'utf-8'))

    const res = await client.deploy({ authChain: [], entityId: 'QmENTITY', files })

    expect(res).toBe(true)
  })
})
