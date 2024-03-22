import { hashV0 } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { IFetchComponent } from '@well-known-components/http-server'
import { AvailableContentResult, ContentClient, createContentClient } from '../src'

describe('ContentClient', () => {
  const URL = 'https://url.com'

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

    const result = await client.downloadContent(fileHash, { retryDelay: 20 })

    // Assert that the correct buffer is returned, and that there was a retry attempt
    expect(result).toEqual(realBuffer)
    expect(fetcher.fetch).toHaveBeenCalledTimes(2)
  })

  it("when a file is download, then the client doesn't check if the file is correct if the avoid checks flags is set", async () => {
    const failBuffer = Buffer.from('Fail')
    const realBuffer = Buffer.from('Real')

    const fileHash = await hashV0(realBuffer)

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      buffer: jest.fn().mockResolvedValueOnce(failBuffer).mockResolvedValueOnce(realBuffer)
    })

    const client = buildClient(URL, fetcher)
    const result = await client.downloadContent(fileHash, { retryDelay: 20, avoidChecks: true })
    expect(result).toEqual(failBuffer)
    expect(fetcher.fetch).toHaveBeenCalledTimes(1)
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
    await expect(client.downloadContent(fileHash, { attempts: 2, retryDelay: 20 })).rejects.toEqual(
      new Error(`Failed to fetch file with hash ${fileHash} from ${URL}/contents`)
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

  function buildClient(url: string, fetcher: IFetchComponent): ContentClient {
    return createContentClient({ url, fetcher })
  }
})
