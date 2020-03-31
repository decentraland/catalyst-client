import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { mock, instance, when, anything, verify } from 'ts-mockito'
import { CatalystClient } from 'CatalystClient'
import { EntityType, Entity, Fetcher, Hashing } from 'dcl-catalyst-commons'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('CatalystClient', () => {

    const URL = 'https://url.com'

    it('When has spaces and trailing slash, they are removed', () => {
        const url = ' http://url.com/ '
        const sanitized = CatalystClient.sanitizeUrl(url)

        expect(sanitized).to.equal('http://url.com')
    })

    it('When there is no protocol set, then https is added', () => {
        const url = 'url.com'
        const sanitized = CatalystClient.sanitizeUrl(url)

        expect(sanitized).to.equal('https://url.com')
    })

    it('When fetching by pointers, if none is set, then an error is thrown', () => {
        const { mock: mocked, instance: fetcher } = mockFetcherJson()

        const client = new CatalystClient(URL, fetcher)
        const result = client.fetchEntitiesByPointers(EntityType.PROFILE, [])

        expect(result).to.be.rejectedWith(`You must set at least one pointer.`)
        verify(mocked.fetchJson(anything())).never()
    })

    it('When fetching by pointers, then the result is as expected', async () => {
        const requestResult: Entity[] = [ someEntity() ]
        const pointer = "P"
        const { instance: fetcher } = mockFetcherJson(`/content/entities/profile?pointer=${pointer}`, requestResult)

        const client = new CatalystClient(URL, fetcher)
        const result = await client.fetchEntitiesByPointers(EntityType.PROFILE, [pointer])

        expect(result).to.equal(requestResult)
    })

    it('When fetching by ids, if none is set, then an error is thrown', () => {
        const { mock: mocked, instance: fetcher } = mockFetcherJson()

        const client = new CatalystClient(URL, fetcher)
        const result = client.fetchEntitiesByIds(EntityType.PROFILE, [])

        expect(result).to.be.rejectedWith(`You must set at least one id.`)
        verify(mocked.fetchJson(anything())).never()
    })

    it('When fetching by ids, then the result is as expected', async () => {
        const requestResult: Entity[] = [ someEntity() ]
        const id = "Id"
        const { instance: fetcher } = mockFetcherJson(`/content/entities/profile?id=${id}`, requestResult)

        const client = new CatalystClient(URL, fetcher)
        const result = await client.fetchEntitiesByIds(EntityType.PROFILE, [id])

        expect(result).to.equal(requestResult)
    })

    it('When fetching by id, if there are no results, then an error is thrown', async () => {
        const id = "Id"
        const { instance: fetcher } = mockFetcherJson(`/content/entities/profile?id=${id}`, [ ])

        const client = new CatalystClient(URL, fetcher)
        const result = client.fetchEntityById(EntityType.PROFILE, id)

        expect(result).to.be.rejectedWith(`Failed to find an entity with type '${EntityType.PROFILE}' and id '${id}'.`)
    })

    it('When fetching by id, then the result is as expected', async () => {
        const entity = someEntity()
        const requestResult: Entity[] = [ entity ]
        const id = "Id"
        const { instance: fetcher } = mockFetcherJson(`/content/entities/profile?id=${id}`, requestResult)

        const client = new CatalystClient(URL, fetcher)
        const result = await client.fetchEntityById(EntityType.PROFILE, id)

        expect(result).to.equal(entity)
    })

    it('When a file is downloaded, then the client retries if there if the downloaded file is not as expected', async () => {
        const failBuffer = Buffer.from("Fail")
        const realBuffer = Buffer.from("Real")
        const fileHash = await Hashing.calculateBufferHash(realBuffer)

        // Create mock, and return the wrong buffer the first time, and the correct one the second time
        let mockedFetcher: Fetcher = mock(Fetcher);
        when(mockedFetcher.fetchBuffer(`${URL}/content/contents/${fileHash}`, anything())).thenReturn(Promise.resolve(failBuffer), Promise.resolve(realBuffer))
        const fetcher = instance(mockedFetcher)

        const client = new CatalystClient(URL, fetcher)
        const result = await client.downloadContent(fileHash, { waitTime: '20' })

        // Assert that the correct buffer is returned, and that there was a retry attempt
        expect(result).to.equal(realBuffer)
        verify(mockedFetcher.fetchBuffer(`${URL}/content/contents/${fileHash}`, anything())).times(2)
    })

    it('When a file is downloaded and all attempts failed, then an exception is thrown', async () => {
        const failBuffer = Buffer.from("Fail")
        const fileHash = "Hash"

        // Create mock, and return the wrong buffer always
        let mockedFetcher: Fetcher = mock(Fetcher);
        when(mockedFetcher.fetchBuffer(`${URL}/content/contents/${fileHash}`, anything())).thenReturn(Promise.resolve(failBuffer))
        const fetcher = instance(mockedFetcher)

        const client = new CatalystClient(URL, fetcher)
        const result = client.downloadContent(fileHash, { attempts: 2, waitTime: '20' })

        // Assert that the request failed, and that the client tried many times as expected
        await expect(result).to.be.rejectedWith(`Failed to fetch file with hash ${fileHash} from ${URL}`)
        verify(mockedFetcher.fetchBuffer(`${URL}/content/contents/${fileHash}`, anything())).times(2)
    })

    function someEntity(): Entity {
        return {
            id: "some-id",
            type: EntityType.PROFILE,
            pointers: ["Pointer"],
            timestamp: 10,
        }
    }

    function mockFetcherJson<T>(path?: string, result?: T): { mock: Fetcher, instance: Fetcher} {
        // Create mock
        let mockedFetcher: Fetcher = mock(Fetcher);

        if (path) {
            when(mockedFetcher.fetchJson(`${URL}${path}`, anything())).thenReturn(Promise.resolve(result))
        }

        // Getting instance from mock
        return { mock: mockedFetcher, instance: instance(mockedFetcher) }
    }

})