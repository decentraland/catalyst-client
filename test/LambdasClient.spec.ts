import { Fetcher } from 'dcl-catalyst-commons'
import { anything, instance, mock, when } from 'ts-mockito'
import { LambdasClient, ProfileFields } from '../src/index'

describe('LambdasClient', () => {
  const URL = 'https://url.com'

  it('When fetching for many profiles, then the result is as expected', async () => {
    const requestResult = [someResult()]
    const [ethAddress1, ethAddress2] = ['ethAddress1', 'ethAddress2']
    const { instance: fetcher } = mockFetcherJson(`/profiles?id=${ethAddress1}&id=${ethAddress2}`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchProfiles([ethAddress1, ethAddress2])

    expect(result).toEqual(requestResult)
  })

  it('When fetching only snapshots in profiles, then the result is as expected', async () => {
    const requestResult = [someResult()]
    const [ethAddress1, ethAddress2] = ['ethAddress1', 'ethAddress2']
    const { instance: fetcher } = mockFetcherJson(
      `/profiles?fields=snapshots&id=${ethAddress1}&id=${ethAddress2}`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchProfiles([ethAddress1, ethAddress2], { fields: ProfileFields.ONLY_SNAPSHOTS })

    expect(result).toEqual(requestResult)
  })

  it('When fetching for wearables, then the result is as expected', async () => {
    const wearables = [{ id: 'wearableId' }]
    const requestResult = {
      wearables,
      pagination: { offset: 0, limit: 0, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJson(
      `/collections/wearables?textSearch=text&wearableId=id1&wearableId=id2`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchWearables({ wearableIds: ['id1', 'id2'], textSearch: 'text' })

    expect(result).toEqual(wearables)
  })

  it('When fetching for owned wearables without definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10 }]
    const { instance: fetcher } = mockFetcherJson(
      `/collections/wearables-by-owner/${ethAddress}?includeDefinitions=false`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedWearables(ethAddress, false)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned wearables with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]
    const { instance: fetcher } = mockFetcherJson(
      `/collections/wearables-by-owner/${ethAddress}?includeDefinitions=true`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedWearables(ethAddress, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for emotes, then the result is as expected', async () => {
    const emotes = [{ id: 'emoteId' }]
    const requestResult = {
      emotes,
      pagination: { offset: 0, limit: 0, moreData: false }
    }
    const { instance: fetcher } = mockFetcherJson(
      `/collections/emotes?textSearch=text&emoteId=id1&emoteId=id2`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEmotes({ emoteIds: ['id1', 'id2'], textSearch: 'text' })

    expect(result).toEqual(emotes)
  })

  it('When fetching for owned emotes without definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10 }]
    const { instance: fetcher } = mockFetcherJson(
      `/collections/emotes-by-owner/${ethAddress}?includeDefinitions=false`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedEmotes(ethAddress, false)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned emotes with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]
    const { instance: fetcher } = mockFetcherJson(
      `/collections/emotes-by-owner/${ethAddress}?includeDefinitions=true`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedEmotes(ethAddress, true)

    expect(result).toEqual(requestResult)
  })

  it('adds version to query string whe requesting a particular version', async () => {
    const requestResult = [someResult()]
    const [ethAddress1, ethAddress2] = ['ethAddress1', 'ethAddress2']
    const [version1, version2] = [1, 2]
    const { instance: fetcher } = mockFetcherJson(
      `/profiles?id=${ethAddress1}&id=${ethAddress2}&version=${version1}&version=${version2}`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchProfiles([ethAddress1, ethAddress2], { versions: [version1, version2] })

    expect(result).toEqual(requestResult)
  })

  function someResult() {
    return {
      someKey: 'someValue'
    }
  }

  function mockFetcherJson<T>(path?: string, result?: T): { mock: Fetcher; instance: Fetcher } {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    if (path) {
      when(mockedFetcher.fetchJson(anything(), anything())).thenCall((url, _) => {
        expect(url).toEqual(`${URL}${path}`)
        return Promise.resolve(result)
      })
    }

    // Getting instance from mock
    return { mock: mockedFetcher, instance: instance(mockedFetcher) }
  }

  function buildClient(URL: string, fetcher: Fetcher): LambdasClient {
    return new LambdasClient({ lambdasUrl: URL, fetcher: fetcher })
  }
})
