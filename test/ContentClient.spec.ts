import { hashV0 } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { IFetchComponent } from '@well-known-components/interfaces'
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

  let mockFetch: IFetchComponent
  const baseUrl = 'https://peer-test.decentraland.org/content'
  const secondaryUrl = 'https://peer-test-2.decentraland.org/content'
  const tertiaryUrl = 'https://peer-test-3.decentraland.org/content'

  const mockEntity1: Entity = {
    version: 'v3',
    id: 'entity1',
    type: EntityType.SCENE,
    pointers: ['pointer1'],
    timestamp: 1000,
    content: [],
    metadata: {}
  }

  const mockEntity2: Entity = {
    version: 'v3',
    id: 'entity2',
    type: EntityType.SCENE,
    pointers: ['pointer1'],
    timestamp: 2000,
    content: [],
    metadata: {}
  }

  const mockEntity3: Entity = {
    version: 'v3',
    id: 'entity3',
    type: EntityType.SCENE,
    pointers: ['pointer1'],
    timestamp: 3000,
    content: [],
    metadata: {}
  }

  const createMockJsonResponse = (data: any): any => ({
    json: async () => data
  })

  beforeEach(() => {
    mockFetch = createFetchComponent()
  })

  const urlMatches = (urlStr: string, pattern: string) => urlStr.includes(pattern)

  describe('Parallel fetch functionality', () => {
    describe('fetchEntitiesByIds', () => {
      it('should use parallel fetch when configured globally', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: [secondaryUrl, tertiaryUrl]
          }
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
          const urlString = url.toString()
          if (urlMatches(urlString, baseUrl)) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return createMockJsonResponse([mockEntity1])
          } else if (urlMatches(urlString, secondaryUrl)) {
            await new Promise((resolve) => setTimeout(resolve, 50))
            return createMockJsonResponse([mockEntity2])
          } else {
            await new Promise((resolve) => setTimeout(resolve, 150))
            return createMockJsonResponse([mockEntity3])
          }
        })

        const result = await client.fetchEntitiesByIds(['entity1'])
        expect(result).toEqual([mockEntity2])
        expect(mockFetch.fetch).toHaveBeenCalledTimes(3)
      })

      it('should use parallel fetch when configured per request', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })

        const fetchSpy = jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
          const urlString = url.toString()
          if (urlMatches(urlString, secondaryUrl)) {
            return createMockJsonResponse([mockEntity2])
          }
          await new Promise((resolve) => setTimeout(resolve, 100))
          return createMockJsonResponse([mockEntity1])
        })

        const result = await client.fetchEntitiesByIds(['entity1'], {
          parallel: {
            urls: [secondaryUrl]
          }
        })

        expect(result).toEqual([mockEntity2])
        expect(fetchSpy).toHaveBeenCalledTimes(2)
      })

      it('should handle errors and continue with successful responses', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: [secondaryUrl, tertiaryUrl]
          }
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
          const urlString = url.toString()
          if (urlMatches(urlString, baseUrl)) {
            throw new Error('Network error')
          } else if (urlMatches(urlString, secondaryUrl)) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return createMockJsonResponse([mockEntity2])
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500))
            return createMockJsonResponse([mockEntity3])
          }
        })

        const result = await client.fetchEntitiesByIds(['entity1'])
        expect(result).toEqual([mockEntity2])
      })

      it('should fall back to single server when parallel fetch is disabled', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: []
          }
        })

        const fetchSpy = jest.spyOn(mockFetch, 'fetch').mockImplementation(async () => {
          return createMockJsonResponse([mockEntity1])
        })

        const result = await client.fetchEntitiesByIds(['entity1'])
        expect(result).toEqual([mockEntity1])
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(baseUrl), expect.any(Object))
      })

      it('should handle empty responses', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: [secondaryUrl]
          }
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async () => {
          return createMockJsonResponse([])
        })

        const result = await client.fetchEntitiesByIds(['entity1'])
        expect(result).toEqual([])
      })

      it('should abort pending requests when one succeeds', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: [secondaryUrl, tertiaryUrl]
          }
        })

        let wasAbortCalled = false
        let timeoutId: NodeJS.Timeout

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url: string, requestOptions?: any) => {
          const urlString = url.toString()

          if (urlMatches(urlString, secondaryUrl)) {
            // This request will take 100ms to succeed
            await new Promise((resolve) => setTimeout(resolve, 100))
            return createMockJsonResponse([mockEntity2])
          } else {
            // These requests will take 200ms unless aborted
            return new Promise((resolve) => {
              const signal = requestOptions?.signal as AbortSignal
              if (signal) {
                signal.addEventListener('abort', () => {
                  wasAbortCalled = true
                  if (timeoutId) clearTimeout(timeoutId)
                })
              }
              timeoutId = setTimeout(() => resolve(createMockJsonResponse([])), 200)
            })
          }
        })

        const resultPromise = client.fetchEntitiesByIds(['entity1'])

        // Make jest wait a bit before doing the assertions
        await new Promise((resolve) => setTimeout(resolve, 150))

        // By this point:
        // 1. At 100ms the first request should have succeeded
        // 2. At 100ms the abort should have been triggered
        // 3. At 200ms the second request should have been cancelled
        expect(wasAbortCalled).toBe(true)

        const result = await resultPromise
        expect(result).toEqual([mockEntity2])

        if (timeoutId) clearTimeout(timeoutId)
      })
    })

    describe('fetchEntityById', () => {
      it('should throw error when no entity is found', async () => {
        const client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch,
          parallelConfig: {
            urls: [secondaryUrl]
          }
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async () => {
          return createMockJsonResponse([])
        })

        await expect(client.fetchEntityById('entity1')).rejects.toEqual(`Failed to find an entity with id 'entity1'.`)
      })
    })

    it('should abort pending requests when one succeeds immediately', async () => {
      const client = createContentClient({
        url: baseUrl,
        fetcher: mockFetch,
        parallelConfig: {
          urls: [secondaryUrl, tertiaryUrl]
        }
      })

      let resolveSlowRequest: (value: unknown) => void = () => {}
      const slowRequestPromise = new Promise((resolve) => {
        resolveSlowRequest = resolve
      })

      let timeoutId: NodeJS.Timeout
      let wasAbortCalled = false
      const abortListener = () => {
        wasAbortCalled = true
        if (timeoutId) clearTimeout(timeoutId)
      }

      jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url, requestOptions) => {
        const urlString = url.toString()

        if (urlMatches(urlString, secondaryUrl)) {
          return createMockJsonResponse([mockEntity2])
        } else if (urlMatches(urlString, baseUrl)) {
          const response = await slowRequestPromise
          return createMockJsonResponse(response)
        } else {
          return new Promise((resolve) => {
            const signal = requestOptions?.signal as AbortSignal
            signal?.addEventListener('abort', abortListener)
            timeoutId = setTimeout(() => resolve(createMockJsonResponse([])), 1000)
          })
        }
      })

      const resultPromise = client.fetchEntitiesByIds(['entity1'])

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(wasAbortCalled).toBe(true)

      resolveSlowRequest([mockEntity1])

      const result = await resultPromise
      expect(result).toEqual([mockEntity2])
    })
  })

  describe('checkPointerConsistency', () => {
    describe('when parallel fetch is not configured', () => {
      let client: ContentClient

      beforeEach(() => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })
      })

      it('should throw error', async () => {
        await expect(client.checkPointerConsistency('pointer1')).rejects.toThrow('Parallel configuration is required')
      })
    })

    describe('when all servers return the same entities', () => {
      let client: ContentClient
      let result: {
        isConsistent: boolean
        upToDateEntities?: Entity[]
        outdatedEntities?: Entity[]
      }

      beforeEach(async () => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async () => {
          return createMockJsonResponse([mockEntity3])
        })

        result = await client.checkPointerConsistency('pointer1', {
          parallel: {
            urls: [secondaryUrl]
          }
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('should return isConsistent as true', () => {
        expect(result.isConsistent).toBe(true)
      })

      it('should return upToDateEntities', () => {
        expect(result.upToDateEntities).toEqual([mockEntity3])
      })

      it('should not return outdatedEntities', () => {
        expect(result.outdatedEntities).toBeUndefined()
      })
    })

    describe('when servers return entities with different timestamps', () => {
      let client: ContentClient
      let result: {
        isConsistent: boolean
        upToDateEntities?: Entity[]
        outdatedEntities?: Entity[]
      }

      beforeEach(async () => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
          const urlString = url.toString()
          if (urlMatches(urlString, baseUrl)) {
            return createMockJsonResponse([mockEntity1])
          } else if (urlMatches(urlString, secondaryUrl)) {
            return createMockJsonResponse([mockEntity2])
          }
          return createMockJsonResponse([mockEntity3])
        })

        result = await client.checkPointerConsistency('pointer1', {
          parallel: {
            urls: [secondaryUrl, tertiaryUrl]
          }
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('should return isConsistent as false', () => {
        expect(result.isConsistent).toBe(false)
      })

      it('should return upToDateEntities with newest timestamp', () => {
        expect(result.upToDateEntities).toEqual([mockEntity3])
      })

      it('should return outdatedEntities with older timestamps', () => {
        expect(result.outdatedEntities).toEqual([mockEntity1, mockEntity2])
      })
    })

    describe('when servers have errors', () => {
      let client: ContentClient
      let result: {
        isConsistent: boolean
        upToDateEntities?: Entity[]
        outdatedEntities?: Entity[]
      }

      beforeEach(async () => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
          const urlString = url.toString()
          if (urlMatches(urlString, baseUrl)) {
            throw new Error('Network error')
          }
          return createMockJsonResponse([mockEntity3])
        })

        result = await client.checkPointerConsistency('pointer1', {
          parallel: {
            urls: [secondaryUrl]
          }
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('should return isConsistent as false when errors result in empty arrays while other servers have entities', () => {
        expect(result.isConsistent).toBe(false)
      })

      it('should return upToDateEntities with entities from servers that succeeded', () => {
        expect(result.upToDateEntities).toEqual([mockEntity3])
      })

      it('should not return outdatedEntities when all entities have the same timestamp', () => {
        expect(result.outdatedEntities).toBeUndefined()
      })
    })

    describe('when all servers return empty arrays', () => {
      let client: ContentClient
      let result: {
        isConsistent: boolean
        upToDateEntities?: Entity[]
        outdatedEntities?: Entity[]
      }

      beforeEach(async () => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })

        jest.spyOn(mockFetch, 'fetch').mockImplementation(async () => {
          return createMockJsonResponse([])
        })

        result = await client.checkPointerConsistency('pointer1', {
          parallel: {
            urls: [secondaryUrl]
          }
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('should return isConsistent as true', () => {
        expect(result.isConsistent).toBe(true)
      })

      it('should not return upToDateEntities', () => {
        expect(result.upToDateEntities).toBeUndefined()
      })

      it('should not return outdatedEntities', () => {
        expect(result.outdatedEntities).toBeUndefined()
      })
    })

    describe('when servers have mixed responses', () => {
      let client: ContentClient

      beforeEach(() => {
        client = createContentClient({
          url: baseUrl,
          fetcher: mockFetch
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      describe('and some servers return entities while others return empty arrays', () => {
        let result: {
          isConsistent: boolean
          upToDateEntities?: Entity[]
          outdatedEntities?: Entity[]
        }

        beforeEach(async () => {
          jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
            const urlString = url.toString()
            if (urlMatches(urlString, baseUrl)) {
              return createMockJsonResponse([mockEntity1])
            } else if (urlMatches(urlString, secondaryUrl)) {
              return createMockJsonResponse([])
            }
            return createMockJsonResponse([mockEntity2])
          })

          result = await client.checkPointerConsistency('pointer1', {
            parallel: {
              urls: [secondaryUrl, tertiaryUrl]
            }
          })
        })

        it('should return isConsistent as false', () => {
          expect(result.isConsistent).toBe(false)
        })

        it('should return upToDateEntities with entities from servers that have them', () => {
          expect(result.upToDateEntities).toEqual([mockEntity2])
        })

        it('should return outdatedEntities with older entities', () => {
          expect(result.outdatedEntities).toEqual([mockEntity1])
        })
      })

      describe('and only one server returns entities while others return empty arrays', () => {
        let result: {
          isConsistent: boolean
          upToDateEntities?: Entity[]
          outdatedEntities?: Entity[]
        }

        beforeEach(async () => {
          jest.spyOn(mockFetch, 'fetch').mockImplementation(async (url) => {
            const urlString = url.toString()
            if (urlMatches(urlString, baseUrl)) {
              return createMockJsonResponse([mockEntity1])
            }
            return createMockJsonResponse([])
          })

          result = await client.checkPointerConsistency('pointer1', {
            parallel: {
              urls: [secondaryUrl, tertiaryUrl]
            }
          })
        })

        it('should return isConsistent as false', () => {
          expect(result.isConsistent).toBe(false)
        })

        it('should return upToDateEntities with entities from the server that has them', () => {
          expect(result.upToDateEntities).toEqual([mockEntity1])
        })

        it('should not return outdatedEntities when there is only one entity', () => {
          expect(result.outdatedEntities).toBeUndefined()
        })
      })
    })
  })
})
