import { createFetchComponent } from '@well-known-components/fetch-component'
import { ContentClient, createContentClient } from '../../src'
import { runServerBasedE2ETest } from '../components'
import { multipartParserWrapper } from '../utils'

runServerBasedE2ETest('test client post', ({ components }) => {
  let client: ContentClient

  beforeAll(() => {
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

  beforeEach(async () => {
    client = createContentClient({
      url: await components.getBaseUrl(),
      fetcher: createFetchComponent()
    })
  })

  it('publishes an entity', async () => {
    const files = new Map<string, Uint8Array>()
    files.set('QmA', new Uint8Array([111, 112, 113]))
    files.set('QmB', Buffer.from('asd', 'utf-8'))

    await client.deploy(
      { authChain: [], entityId: 'QmENTITY', files },
      {
        deploymentProtocolVersion: 'v1'
      }
    )
  })

  it('fails to publish an entity using v2 if the server does not support v2', async () => {
    const files = new Map<string, Uint8Array>()
    files.set('QmA', new Uint8Array([111, 112, 113]))
    files.set('QmB', Buffer.from('asd', 'utf-8'))

    await expect(() =>
      client.deploy(
        { authChain: [], entityId: 'QmENTITY', files },
        {
          deploymentProtocolVersion: 'v2'
        }
      )
    ).rejects.toThrowError('The server does not support deployments v2.')
  })
})
