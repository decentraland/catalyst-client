import { ContentClient } from '../src'
import { runServerBasedE2ETest } from './components'
import { multipartParserWrapper } from './utils'

runServerBasedE2ETest('test client post', ({ components }) => {
  let client: ContentClient

  it('configures some endpoints', () => {
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

    components.router.post(
      '/entities',
      multipartParserWrapper(async (ctx) => {
        expect(ctx.formData.fields).toHaveProperty('entityId')
        expect(ctx.formData.fields.entityId.value).toEqual('QmENTITY')
        expect(ctx.formData.files).toHaveProperty('QmA')
        expect(ctx.formData.files).toHaveProperty('QmB')
        // TODO: FOR SOME REASON the `deployEntity` _does not_ send the entity itself by default
        // TODO: FOR SOME REASON the `deployEntity` _does not_ send the entity itself by default

        return {
          status: 200,
          body: {
            creationTimestamp: Date.now()
          }
        }
      })
    )
  })

  it('creates the client', async () => {
    client = new ContentClient({
      contentUrl: await components.getBaseUrl()
    })
  })

  it('publishes an entity', async () => {
    const files = new Map<string, Uint8Array>()
    files.set('QmA', new Uint8Array([111, 112, 113]))
    files.set('QmB', Buffer.from('asd', 'utf-8'))

    await client.deploy({ authChain: [], entityId: 'QmENTITY', files })
  })
})
