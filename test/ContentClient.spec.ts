import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { mock, instance, when, anything, verify } from 'ts-mockito'
import { ContentClient, DeploymentFields } from 'ContentClient'
import {
  EntityType,
  Entity,
  Fetcher,
  Hashing,
  AvailableContentResult,
  PartialDeploymentHistory,
  Deployment,
  EntityVersion,
  SortingField,
  SortingOrder
} from 'dcl-catalyst-commons'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('ContentClient', () => {
  const URL = 'https://url.com'

  it('When fetching by pointers, if none is set, then an error is thrown', () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)
    const result = client.fetchEntitiesByPointers(EntityType.PROFILE, [])

    expect(result).to.be.rejectedWith(`You must set at least one pointer.`)
    verify(mocked.fetchJson(anything())).never()
  })

  it('When fetching by pointers, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const pointer = 'P'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?pointer=${pointer}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByPointers(EntityType.PROFILE, [pointer])

    expect(result).to.deep.equal(requestResult)
  })

  it('When fetching by ids, if none is set, then an error is thrown', () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)
    const result = client.fetchEntitiesByIds(EntityType.PROFILE, [])

    expect(result).to.be.rejectedWith(`You must set at least one id.`)
    verify(mocked.fetchJson(anything())).never()
  })

  it('When fetching by ids, then the result is as expected', async () => {
    const requestResult: Entity[] = [someEntity()]
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntitiesByIds(EntityType.PROFILE, [id])

    expect(result).to.deep.equal(requestResult)
  })

  it('When fetching by id, if there are no results, then an error is thrown', async () => {
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, [])

    const client = buildClient(URL, fetcher)
    const result = client.fetchEntityById(EntityType.PROFILE, id)

    expect(result).to.be.rejectedWith(`Failed to find an entity with type '${EntityType.PROFILE}' and id '${id}'.`)
  })

  it('When fetching by id, then the result is as expected', async () => {
    const entity = someEntity()
    const requestResult: Entity[] = [entity]
    const id = 'Id'
    const { instance: fetcher } = mockFetcherJson(`/entities/profile?id=${id}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEntityById(EntityType.PROFILE, id)

    expect(result).to.equal(entity)
  })

  it('When a file is downloaded, then the client retries if there if the downloaded file is not as expected', async () => {
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
    expect(result).to.equal(realBuffer)
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
    const result = client.downloadContent(fileHash, { attempts: 2, waitTime: '20' })

    // Assert that the request failed, and that the client tried many times as expected
    await expect(result).to.be.rejectedWith(`Failed to fetch file with hash ${fileHash} from ${URL}`)
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

    expect(result).to.deep.equal(requestResult)
  })

  it('When checking if content is available, if none is set, then an error is thrown', () => {
    const { mock: mocked, instance: fetcher } = mockFetcherJson()

    const client = buildClient(URL, fetcher)
    const result = client.isContentAvailable([])

    expect(result).to.be.rejectedWith(`You must set at least one cid.`)
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
    const { instance: fetcher } = mockFetcherJson(
      `/deployments?fromLocalTimestamp=20&toLocalTimestamp=30&onlyCurrentlyPointed=true&deployedBy=eth1&deployedBy=eth2&entityType=profile&entityType=scene&entityId=id1&entityId=id2&pointer=p1&pointer=p2&offset=0`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({ filters: filters })

    expect(result).to.deep.equal([deployment])
  })

  it('When fetching all deployments with no audit, then the result is as expected', async () => {
    const deployment = someDeployment()
    delete deployment.auditInfo
    const requestResult: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment],
      pagination: { offset: 10, limit: 10, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJson(
      `/deployments?fields=pointers,content,metadata&offset=0`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({ fields: DeploymentFields.POINTERS_CONTENT_AND_METADATA })

    expect(result).to.deep.equal([deployment])
  })

  it('When fetching all deployments with sort params, then the request has the correct query params', async () => {
    const deployment = someDeployment()
    const requestResult: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment],
      pagination: { offset: 10, limit: 10, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJson(
      `/deployments?sortingField=entity_timestamp&sortingOrder=ASC&offset=0`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments({
      sortBy: { field: SortingField.ENTITY_TIMESTAMP, order: SortingOrder.ASCENDING }
    })

    expect(result).to.deep.equal([deployment])
  })

  it('When fetching all deployments with pagination, then the result is as expected', async () => {
    const [deployment1, deployment2] = [someDeployment(), someDeployment()]
    const requestResult1: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1],
      pagination: { offset: 0, limit: 1, moreData: true }
    }
    const requestResult2: PartialDeploymentHistory<Deployment> = {
      filters: {},
      deployments: [deployment1, deployment2],
      pagination: { offset: 1, limit: 2, moreData: false }
    }

    const mockedFetcher: Fetcher = mock(Fetcher)
    when(mockedFetcher.fetchJson(`${URL}/deployments?offset=0`, anything())).thenReturn(Promise.resolve(requestResult1))
    when(mockedFetcher.fetchJson(`${URL}/deployments?offset=1`, anything())).thenReturn(Promise.resolve(requestResult2))
    const fetcher = instance(mockedFetcher)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchAllDeployments()

    // We make sure that repeated deployments were ignored
    expect(result).to.deep.equal([deployment1, deployment2])
  })

  function someDeployment(): Deployment {
    return {
      entityId: `entityId${Math.random()}`,
      entityType: EntityType.PROFILE,
      entityTimestamp: 10,
      deployedBy: 'deployedBy',
      pointers: [],
      auditInfo: {
        version: EntityVersion.V2,
        authChain: [],
        originServerUrl: 'serverUrl',
        originTimestamp: 20,
        localTimestamp: 30
      }
    }
  }

  function someEntity(): Entity {
    return {
      id: 'some-id',
      type: EntityType.PROFILE,
      pointers: ['Pointer'],
      timestamp: 10
    }
  }

  function mockFetcherJson<T>(path?: string, result?: T): { mock: Fetcher; instance: Fetcher } {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    if (path) {
      when(mockedFetcher.fetchJson(anything(), anything())).thenCall((url, _) => {
        expect(url).to.equal(`${URL}${path}`)
        return Promise.resolve(result)
      })
    }

    // Getting instance from mock
    return { mock: mockedFetcher, instance: instance(mockedFetcher) }
  }

  function buildClient(URL: string, fetcher: Fetcher) {
    return new ContentClient(URL, 'origin', fetcher)
  }
})
