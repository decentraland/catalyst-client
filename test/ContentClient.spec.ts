import { hashV0 } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { IFetchComponent } from '@well-known-components/http-server'
import { deepEqual, instance, mock, verify, when } from 'ts-mockito'
import { AvailableContentResult } from '../src/ContentAPI'
import { ContentClient } from '../src/ContentClient'
import { DeploymentBuilder } from '../src/utils/DeploymentBuilder'
import { createFetchComponent } from './../src/utils'

describe('ContentClient', () => {
  const URL = 'https://url.com'

  describe('When calling buildEntityWithoutNewFiles', () => {
    let fetcher
    const type = EntityType.PROFILE
    const pointers = ['p1']
    const hashesByKey = undefined
    const metadata = {}
    const currentTime = 100
    let deploymentBuilderClassMock: typeof DeploymentBuilder

    beforeEach(async () => {
      deploymentBuilderClassMock = mock<typeof DeploymentBuilder>(DeploymentBuilder)

      when(
        deploymentBuilderClassMock.buildEntityWithoutNewFiles({
          type,
          pointers,
          hashesByKey,
          metadata,
          timestamp: currentTime,
          contentUrl: URL
        })
      ).thenResolve()

      const client = buildClient(URL, fetcher, instance(deploymentBuilderClassMock))
      await client.buildEntityWithoutNewFiles({ type, pointers, hashesByKey, metadata, timestamp: currentTime })
    })

    it('should call the deployer builder with the expected parameters', () => {
      verify(
        deploymentBuilderClassMock.buildEntityWithoutNewFiles(
          deepEqual({
            type,
            pointers,
            hashesByKey,
            metadata,
            timestamp: currentTime,
            contentUrl: URL
          })
        )
      ).once()
    })
  })

  describe('buildEntityFormDataForDeployment', () => {
    it('works as expected', async () => {
      const fetcher = createFetchComponent()
      fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => [] })
      const client = buildClient(URL, fetcher)

      const files = new Map<string, Uint8Array>()
      files.set('QmA', new Uint8Array([111, 112, 113]))
      files.set('QmB', Buffer.from('asd', 'utf-8'))

      const form = await client.buildEntityFormDataForDeployment({ authChain: [], entityId: 'QmENTITY', files })

      const formData = form.getBuffer().toString().replace(/\s*$/gm, '')

      expect(formData).toContain(
        `
        | Content-Disposition: form-data; name="QmA"; filename="QmA"
        | Content-Type: application/octet-stream
        |
        |
        | opq
        `
          .replace(/^(\s*\|\s)*/gm, '') // scala, I miss you buddy...
          .trim()
      )

      expect(formData).toContain(
        `
        | Content-Disposition: form-data; name="entityId"
        |
        |
        | QmENTITY
        `
          .replace(/^(\s*\|\s)*/gm, '') // scala, I miss you buddy...
          .trim()
      )

      expect(formData).toContain(
        `
        | Content-Disposition: form-data; name="QmB"; filename="QmB"
        | Content-Type: application/octet-stream
        |
        |
        | asd
        `
          .replace(/^(\s*\|\s)*/gm, '') // scala, I miss you buddy...
          .trim()
      )
    })
  })

  describe('When calling buildDeployment', () => {
    let fetcher: IFetchComponent
    const type = EntityType.PROFILE
    const pointers = ['p1']
    const files = new Map<string, Uint8Array>()
    files.set('QmA', new Uint8Array([1, 2, 3]))
    files.set('QmB', Buffer.from('asd', 'utf-8'))
    const metadata = {}
    const currentTime = 100
    let client: ContentClient
    let deploymentBuilderClassMock: typeof DeploymentBuilder

    beforeEach(async () => {
      deploymentBuilderClassMock = mock<typeof DeploymentBuilder>(DeploymentBuilder)

      when(
        deploymentBuilderClassMock.buildEntity({
          type,
          pointers,
          files,
          metadata,
          timestamp: currentTime
        })
      ).thenResolve()

      client = buildClient(URL, fetcher, instance(deploymentBuilderClassMock))
      await client.buildEntity({ type, pointers, files, metadata, timestamp: currentTime })
    })

    it('should call the deployer builder with the expected parameters', () => {
      verify(
        deploymentBuilderClassMock.buildEntity(
          deepEqual({
            type,
            pointers,
            files,
            metadata,
            timestamp: currentTime
          })
        )
      ).once()
    })
  })

  it('When building a deployment, then the deployment is built', async () => {
    const requestResult: Entity[] = [someEntity()]
    const pointer = 'P'
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })
    const client = buildClient(URL, fetcher)

    const result = await client.fetchEntitiesByPointers([pointer])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by pointers, if none is set, then an error is thrown', async () => {
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => [] })
    const client = buildClient(URL, fetcher)

    const result = client.fetchEntitiesByPointers([])

    await expect(result).rejects.toEqual(`You must set at least one pointer.`)
    expect(fetcher.fetch).not.toHaveBeenCalled()
  })

  it('When fetching by pointers, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const pointer = 'P'
    const fetcher = createFetchComponent()

    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByPointers([pointer])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by ids, if none is set, then an error is thrown', async () => {
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => [] })
    const client = buildClient(URL, fetcher)

    const result = client.fetchEntitiesByIds([])

    await expect(result).rejects.toEqual(`You must set at least one id.`)
    expect(fetcher.fetch).not.toHaveBeenCalled()
  })

  it('When fetching by ids, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const id = 'Id'

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })
    const client = buildClient(URL, fetcher)

    const result = await client.fetchEntitiesByIds([id])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by id, if there are no results, then an error is thrown', async () => {
    const id = 'Id'

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => [] })
    const client = buildClient(URL, fetcher)

    await expect(client.fetchEntityById(id)).rejects.toEqual(`Failed to find an entity with id '${id}'.`)
  })

  it('When fetching by id, then the result is as expected', async () => {
    const entity = someEntity()
    const requestResult: Entity[] = [entity]
    const id = 'Id'

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })
    const client = buildClient(URL, fetcher)

    const result = await client.fetchEntityById(id)

    expect(result).toEqual(entity)
  })

  it('When a file is downloaded, then the client retries if the downloaded file is not as expected', async () => {
    const failBuffer = Buffer.from('Fail')
    const realBuffer = Buffer.from('Real')
    const fileHash = await hashV0(realBuffer)

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      buffer: jest.fn().mockResolvedValueOnce(failBuffer).mockResolvedValueOnce(realBuffer)
    })
    const client = buildClient(URL, fetcher)

    const result = await client.downloadContent(fileHash, { waitTime: '20' })

    // Assert that the correct buffer is returned, and that there was a retry attempt
    expect(result).toEqual(realBuffer)
    expect(fetcher.fetch).toHaveBeenCalledTimes(2)
  })

  it('When a file is downloaded and all attempts failed, then an exception is thrown', async () => {
    const failBuffer = Buffer.from('Fail')
    const fileHash = 'Hash'

    // Create mock, and return the wrong buffer always
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      buffer: jest.fn().mockResolvedValueOnce(failBuffer).mockResolvedValueOnce(failBuffer)
    })

    const client = buildClient(URL, fetcher)

    // Assert that the request failed, and that the client tried many times as expected
    await expect(client.downloadContent(fileHash, { attempts: 2, waitTime: '20' })).rejects.toEqual(
      new Error(`Failed to fetch file with hash ${fileHash} from ${URL}`)
    )

    expect(fetcher.fetch).toHaveBeenNthCalledWith(1, `${URL}/contents/${fileHash}`, expect.anything())
    expect(fetcher.fetch).toHaveBeenNthCalledWith(2, `${URL}/contents/${fileHash}`, expect.anything())
  })

  it('When checking if content is available, then the result is as expected', async () => {
    const [hash1, hash2] = ['hash1', 'hash2']
    const requestResult: AvailableContentResult = [
      { cid: hash1, available: true },
      { cid: hash2, available: false }
    ]

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockReturnValue(requestResult)
    })
    const client = buildClient(URL, fetcher)

    const result = await client.isContentAvailable([hash1, hash2])

    expect(result).toEqual(requestResult)
  })

  it('When checking if content is available, if none is set, then an error is thrown', async () => {
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockReturnValue({})
    })
    const client = buildClient(URL, fetcher)

    await expect(client.isContentAvailable([])).rejects.toEqual(`You must set at least one cid.`)
    expect(fetcher.fetch).not.toHaveBeenCalled()
  })

  function someEntity(): Entity {
    return {
      version: 'v3',
      id: 'some-id',
      type: EntityType.PROFILE,
      pointers: ['Pointer'],
      content: [],
      timestamp: 10
    }
  }

  function buildClient(
    URL: string,
    fetcher?: IFetchComponent,
    deploymentBuilderClass?: typeof DeploymentBuilder
  ): ContentClient {
    return new ContentClient({
      contentUrl: URL,
      fetcher,
      deploymentBuilderClass: deploymentBuilderClass
    })
  }
})
