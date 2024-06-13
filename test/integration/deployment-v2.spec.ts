import { createFetchComponent } from '@well-known-components/fetch-component'
import { ContentClient, createContentClient, DeploymentBuilder } from '../../src'
import { runServerBasedE2ETest } from '../components'
import { AuthLinkType, EntityType } from '@dcl/schemas'
import { DeploymentPreparationData } from '../../src/client'
import { hashV1 } from '@dcl/hashing'
import { multipartParserWrapper } from '../utils'

runServerBasedE2ETest('test deployment v2 protocol', ({ components }) => {
  let client: ContentClient
  let expectedFiles: Record<string, Uint8Array>
  let stage = 1
  let filesPendingUpload: Record<string, Uint8Array>
  let file1: Uint8Array
  let file1Hash: string
  let file2: Uint8Array
  let file2Hash: string
  let files: Map<string, Uint8Array>
  let preparationData: DeploymentPreparationData

  beforeEach(async () => {
    file1 = new Uint8Array([111, 112, 113])
    file2 = Buffer.from('asd', 'utf-8')
    file1Hash = await hashV1(file1)
    file2Hash = await hashV1(file2)
    files = new Map<string, Uint8Array>()
    files.set('file.bin', file1)
    files.set('file.txt', file2)

    preparationData = await DeploymentBuilder.buildEntity({
      type: EntityType.SCENE,
      pointers: ['1,3'],
      timestamp: Date.now(),
      files,
      metadata: { name: 'My Scene' }
    })

    expectedFiles = {
      [file1Hash]: file1,
      [file2Hash]: file2
    }
    filesPendingUpload = { ...expectedFiles }

    components.router.options('/v2/entities/:entityId/files/:fileHash', async (_ctx) => {
      expect(stage++).toBe(1)

      return {
        status: 200
      }
    })

    components.router.post(
      '/v2/entities',
      multipartParserWrapper(async (ctx) => {
        expect(stage++).toBe(2)

        expect(ctx.formData.fields).toHaveProperty('entityId')
        expect(ctx.formData.fields.entityId.value).toEqual(preparationData.entityId)
        expect(ctx.formData.fields['authChain[0][type]'].value).toEqual('SIGNER')
        expect(ctx.formData.fields['authChain[0][payload]'].value).toEqual('0x1')
        expect(ctx.formData.fields['authChain[0][signature]'].value).toEqual('')

        expect(ctx.formData.files).toHaveProperty(preparationData.entityId)
        const entityMetadata = JSON.parse(ctx.formData.files[preparationData.entityId].value.toString())
        expect(entityMetadata).toMatchObject({
          version: 'v3',
          type: EntityType.SCENE,
          pointers: ['1,3'],
          metadata: { name: 'My Scene' },
          content: [
            { file: 'file.bin', hash: file1Hash },
            { file: 'file.txt', hash: file2Hash }
          ]
        })

        return {
          status: 202, // Accepted
          body: {
            availableFiles: [],
            missingFiles: entityMetadata.content.map(($) => $.hash)
          }
        }
      })
    )

    components.router.post('/v2/entities/:entityId/files/:fileHash', async (ctx) => {
      expect(stage).toBe(3)
      expect(ctx.params.entityId).toBe(preparationData.entityId)
      expect(expectedFiles).toHaveProperty(ctx.params.fileHash)
      expect(Buffer.from(await ctx.request.arrayBuffer())).toEqual(Buffer.from(expectedFiles[ctx.params.fileHash]))

      delete filesPendingUpload[ctx.params.fileHash]
      if (Object.keys(filesPendingUpload).length === 0) {
        stage++
      }

      return {
        status: 204
      }
    })

    components.router.put('/v2/entities/:entityId', async (ctx) => {
      expect(stage++).toBe(4)
      expect(ctx.params.entityId).toBe(preparationData.entityId)

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
    const res = await client.deploy({
      ...preparationData,
      authChain: [{ type: AuthLinkType.SIGNER, payload: '0x1', signature: '' }]
    })

    expect(res).toBe(true)
    expect(stage).toBe(5)
  })
})
