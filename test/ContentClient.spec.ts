import {
  AvailableContentResult,
  Deployment,
  Entity,
  EntityType,
  EntityVersion,
  Fetcher,
  Hashing,
  PartialDeploymentHistory,
  SortingField,
  SortingOrder
} from 'dcl-catalyst-commons'
import { Headers } from 'node-fetch'
import { Readable } from 'stream'
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito'
import { DeploymentWithMetadataContentAndPointers } from '../src/ContentAPI'
import { ContentClient, DeploymentFields } from '../src/ContentClient'
import { DeploymentBuilder } from '../src/utils/DeploymentBuilder'

describe('ContentClient', () => {
  const URL = 'https://url.com'

  describe('When calling buildEntityWithoutNewFiles', () => {
    let mocked
    let fetcher
    const type = EntityType.PROFILE
    const pointers = ['p1']
    const hashesByKey = undefined
    const metadata = {}
    const currentTime = 100
    let deploymentBuilderClassMock: typeof DeploymentBuilder

    beforeEach(async () => {
      ;({ mock: mocked, instance: fetcher } = mockFetcherJson('/status', { currentTime, version: EntityVersion.V3 }))

      deploymentBuilderClassMock = mock<typeof DeploymentBuilder>(DeploymentBuilder)

      when(
        deploymentBuilderClassMock.buildEntityWithoutNewFiles({
          version: EntityVersion.V3,
          type,
          pointers,
          hashesByKey,
          metadata,
          timestamp: currentTime
        })
      ).thenResolve()

      const client = buildClient(URL, fetcher, instance(deploymentBuilderClassMock))
      await client.buildEntityWithoutNewFiles({ type, pointers, hashesByKey, metadata })
    })

    it('should fetch the status', () => {
      verify(mocked.fetchJson(URL + '/status', anything())).once()
    })

    it('should call the deployer builder with the expected parameters', () => {
      verify(
        deploymentBuilderClassMock.buildEntityWithoutNewFiles(
          deepEqual({
            version: EntityVersion.V3,
            type,
            pointers,
            hashesByKey,
            metadata,
            timestamp: currentTime
          })
        )
      ).once()
    })
  })

  describe('buildEntityFormDataForDeployment', () => {
    it('works as expected', async () => {
      const mock = mockFetcherJson()
      mock.mockUrl('/status', { currentTime: 1, version: EntityVersion.V3 })
      mock.mockUrl('/available-content?cid=QmA&cid=QmB', [])

      const client = new ContentClient({ contentUrl: URL, fetcher: mock.instance })

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
    let mocked
    let fetcher
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
      ;({ mock: mocked, instance: fetcher } = mockFetcherJson('/status', { currentTime, version: EntityVersion.V3 }))

      deploymentBuilderClassMock = mock<typeof DeploymentBuilder>(DeploymentBuilder)

      when(
        deploymentBuilderClassMock.buildEntity({
          version: EntityVersion.V3,
          type,
          pointers,
          files,
          metadata,
          timestamp: currentTime
        })
      ).thenResolve()

      client = buildClient(URL, fetcher, instance(deploymentBuilderClassMock))
      await client.buildEntity({ type, pointers, files, metadata })
    })

    it('should fetch the status', () => {
      verify(mocked.fetchJson(URL + '/status', anything())).once()
    })

    it('should call the deployer builder with the expected parameters', () => {
      verify(
        deploymentBuilderClassMock.buildEntity(
          deepEqual({
            version: EntityVersion.V3,
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
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?pointer=${pointer}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByPointers(EntityType.PROFILE, [pointer])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by pointers, if none is set, then an error is thrown', () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)
    const result = client.fetchEntitiesByPointers(EntityType.PROFILE, [])

    expect(result).rejects.toEqual(`You must set at least one pointer.`)
    verify(mocked.fetchJson(anything())).never()
  })

  it('When fetching by pointers, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const pointer = 'P'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?pointer=${pointer}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByPointers(EntityType.PROFILE, [pointer])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by ids, if none is set, then an error is thrown', () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)
    const result = client.fetchEntitiesByIds(EntityType.PROFILE, [])

    expect(result).rejects.toEqual(`You must set at least one id.`)
    verify(mocked.fetchJson(anything())).never()
  })

  it('When fetching by ids, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByIds(EntityType.PROFILE, [id])

    expect(result).toEqual(requestResult)
  })

  it('When fetching by id, if there are no results, then an error is thrown', async () => {
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, [])

    const client = buildClient(URL, fetcher)

    await expect(client.fetchEntityById(EntityType.PROFILE, id)).rejects.toEqual(
      `Failed to find an entity with type '${EntityType.PROFILE}' and id '${id}'.`
    )
  })

  it('When fetching by id, then the result is as expected', async () => {
    const entity = someEntity()
    const requestResult: Entity[] = [entity]
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntityById(EntityType.PROFILE, id)

    expect(result).toEqual(entity)
  })

  it('When a file is downloaded, then the client retries if the downloaded file is not as expected', async () => {
    const failBuffer = Buffer.from('Fail')
    const realBuffer = Buffer.from('Real')
    const fileHash = await Hashing.calculateBufferHash(realBuffer)

    // Create mock, and return the wrong buffer the first time, and the correct one the second time
    const mockedFetcher: Fetcher = mock(Fetcher)
    when(mockedFetcher.fetchBuffer(`${URL}/contents/${fileHash}`, anything())).thenReturn(
      Promise.resolve(failBuffer),
      Promise.resolve(realBuffer)
    )
    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)
    const result = await client.downloadContent(fileHash, { waitTime: '20' })

    // Assert that the correct buffer is returned, and that there was a retry attempt
    expect(result).toEqual(realBuffer)
    verify(mockedFetcher.fetchBuffer(`${URL}/contents/${fileHash}`, anything())).times(2)
  })

  it('When a file is downloaded and all attempts failed, then an exception is thrown', async () => {
    const failBuffer = Buffer.from('Fail')
    const fileHash = 'Hash'

    // Create mock, and return the wrong buffer always
    const mockedFetcher: Fetcher = mock(Fetcher)
    when(mockedFetcher.fetchBuffer(`${URL}/contents/${fileHash}`, anything())).thenReturn(Promise.resolve(failBuffer))
    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)

    // Assert that the request failed, and that the client tried many times as expected
    await expect(client.downloadContent(fileHash, { attempts: 2, waitTime: '20' })).rejects.toEqual(
      new Error(`Failed to fetch file with hash ${fileHash} from ${URL}`)
    )

    verify(mockedFetcher.fetchBuffer(`${URL}/contents/${fileHash}`, anything())).times(2)
  })

  it('When checking if content is available, then the result is as expected', async () => {
    const [hash1, hash2] = ['hash1', 'hash2']
    const requestResult: AvailableContentResult = [
      { cid: hash1, available: true },
      { cid: hash2, available: false }
    ]
    const { instance: fetcher } = mockFetcherJson(`/available-content?cid=${hash1}&cid=${hash2}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.isContentAvailable([hash1, hash2])

    expect(result).toEqual(requestResult)
  })

  it('When checking if content is available, if none is set, then an error is thrown', async () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)

    await expect(client.isContentAvailable([])).rejects.toEqual(`You must set at least one cid.`)
    verify(mocked.fetchJson(anything())).never()
  })

  it('When fetching all deployments, then the result is as expected', async () => {
    const deployment = someDeployment()
    const filters = {
      fromLocalTimestamp: 20,
      toLocalTimestamp: 30,
      onlyCurrentlyPointed: true,
      deployedBy: ['eth1', 'eth2'],
      entityTypes: [EntityType.PROFILE, EntityType.SCENE],
      entityIds: ['id1', 'id2'],
      pointers: ['p1', 'p2']
    }
    const requestResult: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment],
      pagination: { offset: 10, limit: 10, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJsonDeployments(
      `/deployments?fromLocalTimestamp=20&toLocalTimestamp=30&onlyCurrentlyPointed=true&deployedBy=eth1&deployedBy=eth2&entityType=profile&entityType=scene&entityId=id1&entityId=id2&pointer=p1&pointer=p2`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({ filters: filters })

    expect(result).toEqual([deployment])
  })

  it('When fetching all deployments with no audit, then the result is as expected', async () => {
    const deployment = someDeployment()
    const { auditInfo, ...deploymentWithoutAuditInfo } = deployment
    const requestResult: PartialDeploymentHistory<DeploymentWithMetadataContentAndPointers> = {
      filters: {},
      deployments: [deploymentWithoutAuditInfo],
      pagination: { offset: 10, limit: 10, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJsonDeployments(
      `/deployments?entityType=${EntityType.PROFILE}&fields=pointers,content,metadata`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({
      filters: { entityTypes: [EntityType.PROFILE] },
      fields: DeploymentFields.POINTERS_CONTENT_AND_METADATA
    })

    expect(result).toEqual([deploymentWithoutAuditInfo])
  })

  it('When fetching all deployments with no filters, then an error is thrown', async () => {
    const client = buildClient(URL)
    expect.assertions(1)
    await expect(
      client.fetchAllDeployments({
        filters: {
          deployedBy: [],
          entityTypes: [],
          entityIds: [],
          pointers: [],
          onlyCurrentlyPointed: true
        }
      })
    ).rejects.toEqual(
      new Error(`When fetching deployments, you must set at least one filter that isn't 'onlyCurrentlyPointed'`)
    )
  })

  it('When fetching all deployments with sort params, then the request has the correct query params', async () => {
    const deployment = someDeployment()
    const requestResult: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment],
      pagination: { offset: 10, limit: 10, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJsonDeployments(
      `/deployments?entityType=${EntityType.PROFILE}&sortingField=entity_timestamp&sortingOrder=ASC`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({
      filters: { entityTypes: [EntityType.PROFILE] },
      sortBy: { field: SortingField.ENTITY_TIMESTAMP, order: SortingOrder.ASCENDING }
    })

    expect(result).toEqual([deployment])
  })

  it('When fetching all deployments with pagination, then subsequent calls are made correctly', async () => {
    const [deployment1, deployment2] = [someDeployment(), someDeployment()]
    const next = `?someName=value1&someName=value3`
    const requestResult1: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1],
      pagination: { next, offset: 0, limit: 1, moreData: true }
    }
    const requestResult2: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1, deployment2],
      pagination: { offset: 1, limit: 2, moreData: false }
    }

    const mockedFetcher: Fetcher = mock(Fetcher)

    when(mockedFetcher.fetch(anything(), anything())).thenCall((url, _) => {
      if (url == `${URL}/deployments?entityType=${EntityType.PROFILE}&fields=auditInfo`) {
        return Promise.resolve(new Response(JSON.stringify(requestResult1)))
      }
      if (url == `${URL}/deployments${next}`) {
        return Promise.resolve(new Response(JSON.stringify(requestResult2)))
      }
      throw new Error(`Mock not ready for ${url}`)
    })

    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({
      filters: { entityTypes: [EntityType.PROFILE] },
      fields: DeploymentFields.AUDIT_INFO
    })

    // We make sure that repeated deployments were ignored
    expect(result).toEqual([deployment1, deployment2])
  })

  it('When fetching all deployments with pagination, if a request fails due to network it stops the iterator', async () => {
    const [deployment1, deployment2] = [someDeployment(), someDeployment()]
    const next = `?someName=value1&someName=value3`
    const requestResult1: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1, deployment2],
      pagination: { next, offset: 0, limit: 987, moreData: true }
    }

    const mockedFetcher: Fetcher = mock(Fetcher)

    when(mockedFetcher.fetch(anything(), anything())).thenCall((url, _) => {
      if (url == `${URL}/deployments?entityType=${EntityType.PROFILE}&fields=auditInfo&limit=987`) {
        return Promise.resolve(new Response(JSON.stringify(requestResult1)))
      }
      throw new Error(`ECONNECTION this is a network error.`)
    })

    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)
    const iterator = client.iterateThroughDeployments({
      filters: { entityTypes: [EntityType.PROFILE] },
      fields: DeploymentFields.AUDIT_INFO,
      limit: 987
    })

    const deployments: any[] = []

    await expect(async () => {
      for await (const it of iterator) {
        deployments.push(it)
      }
    }).rejects.toEqual(new Error(`ECONNECTION this is a network error.`))

    expect(deployments).toEqual([deployment1, deployment2])
  })

  it('When fetching all deployments with pagination, if a request fails due to http server error, it stops the iterator', async () => {
    const [deployment1, deployment2] = [someDeployment(), someDeployment()]
    const next = `?someName=value1&someName=value3`
    const requestResult1: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1, deployment2],
      pagination: { next, offset: 0, limit: 1, moreData: true }
    }

    const mockedFetcher: Fetcher = mock(Fetcher)

    when(mockedFetcher.fetch(anything(), anything())).thenCall((url, _) => {
      if (url == `${URL}/deployments?entityType=${EntityType.PROFILE}&fields=auditInfo`) {
        return Promise.resolve(new Response(JSON.stringify(requestResult1)))
      }
      return Promise.resolve(new Response('Service unavailable', { status: 502 }))
    })

    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)
    const iterator = client.iterateThroughDeployments({
      filters: { entityTypes: [EntityType.PROFILE] },
      fields: DeploymentFields.AUDIT_INFO
    })

    const deployments: any[] = []

    await expect(async () => {
      for await (const it of iterator) {
        deployments.push(it)
      }
    }).rejects.toEqual(
      new Error(
        `Error while requesting deployments to the url https://url.com/deployments?someName=value1&someName=value3. Status code was: 502 Response text was: "Service unavailable"`
      )
    )

    expect(deployments).toEqual([deployment1, deployment2])
  })

  it('When a fetch is piped without headers then none is returned', async () => {
    const contentHash = 'abc123'
    const mockedResponse = instance(mock<Readable>())
    const { instance: fetcher } = mockPipeFetcher(new Headers())
    const client = buildClient(URL, fetcher)

    const result = await client.pipeContent(contentHash, mockedResponse)

    expect(result).toEqual(new Map())
  })

  it('When a fetch is piped with a non recognized header then none is returned', async () => {
    const contentHash = 'abc123'
    const mockedResponse = instance(mock<Readable>())
    const headers: Headers = new Headers()
    headers.set('invalid', 'val')
    const { instance: fetcher } = mockPipeFetcher(headers)
    const client = buildClient(URL, fetcher)

    const result = await client.pipeContent(contentHash, mockedResponse)

    expect(result).toEqual(new Map())
  })

  it('When a fetch is piped then only sanitized headers of the response are returned', async () => {
    const contentHash = 'abc123'
    const mockedResponse = instance(mock<Readable>())
    const headers: Headers = new Headers()
    headers.set('invalid', 'val')
    headers.set('content-length', '200')
    const { instance: fetcher } = mockPipeFetcher(headers)
    const client = buildClient(URL, fetcher)

    const result = await client.pipeContent(contentHash, mockedResponse)

    expect(result.has('Content-Length')).toBe(true)
  })

  function someDeployment(): Deployment {
    return {
      entityVersion: EntityVersion.V3,
      entityId: `entityId${Math.random()}`,
      entityType: EntityType.PROFILE,
      entityTimestamp: 10,
      deployedBy: 'deployedBy',
      pointers: [],
      auditInfo: {
        version: EntityVersion.V2,
        authChain: [],
        localTimestamp: Math.round(Math.random() * 50)
      }
    }
  }

  function someEntity(): Entity {
    return {
      version: EntityVersion.V3,
      id: 'some-id',
      type: EntityType.PROFILE,
      pointers: ['Pointer'],
      timestamp: 10
    }
  }

  function mockFetcherJsonDeployments<T>(path?: string, result?: T): { mock: Fetcher; instance: Fetcher } {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    if (path) {
      when(mockedFetcher.fetch(anything(), anything())).thenCall((url, _) => {
        expect(url).toEqual(`${URL}${path}`)
        return Promise.resolve(new Response(JSON.stringify(result)))
      })
    }

    // Getting instance from mock
    return { mock: mockedFetcher, instance: instance(mockedFetcher) }
  }

  function mockFetcherJson<T>(path?: string, result?: T) {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    function mockUrl(path: string, result: any) {
      when(mockedFetcher.fetchJson(anything(), anything())).thenCall((url, _) => {
        expect(url).toEqual(`${URL}${path}`)
        return Promise.resolve(result)
      })
    }

    if (path) {
      mockUrl(path, result)
    }

    // Getting instance from mock
    return { mock: mockedFetcher, instance: instance(mockedFetcher), mockUrl }
  }

  function mockPipeFetcher(result: Headers): { mock: Fetcher; instance: Fetcher } {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    when(mockedFetcher.fetchPipe(anything(), anything(), anything())).thenResolve(result)

    // Getting instance from mock
    return { mock: mockedFetcher, instance: instance(mockedFetcher) }
  }

  function buildClient(
    URL: string,
    fetcher?: Fetcher,
    deploymentBuilderClass?: typeof DeploymentBuilder
  ): ContentClient {
    return new ContentClient({
      contentUrl: URL,
      fetcher: fetcher,
      deploymentBuilderClass: deploymentBuilderClass
    })
  }
})
