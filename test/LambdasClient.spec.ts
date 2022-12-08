import { Fetcher } from 'dcl-catalyst-commons'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { LambdasClient } from '../src/index'

describe('LambdasClient', () => {
  const URL = 'https://url.com'

  it('When fetching for many profiles, then the result is as expected', async () => {
    const requestResult = [someResult()]
    const [ethAddress1, ethAddress2] = ['ethAddress1', 'ethAddress2']
    const { instance: fetcher } = mockFetcher(`/profiles`, requestResult)

    const client = buildClient(URL, fetcher)
    const result = await client.fetchProfiles([ethAddress1, ethAddress2])

    expect(result).toEqual(requestResult)
  })

  it('When fetching for no profiles, result should eagerly return empty without calling API', async () => {
    const { instance: fetcher, mock } = mockFetcher(`/profiles`, [])

    const client = buildClient(URL, fetcher)
    const result = await client.fetchProfiles([])

    expect(result.length).toBe(0)
    verify(mock.fetch(anything(), anything())).never()
  })

  it('When fetching for wearables, then the result is as expected', async () => {
    const wearables = [{ id: 'wearableId' }]
    const requestResult = {
      wearables,
      pagination: { offset: 0, limit: 0, moreData: false }
    }
    const { instance: fetcher } = mockFetcher(
      `/collections/wearables?textSearch=text&wearableId=id1&wearableId=id2`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchWearables({ wearableIds: ['id1', 'id2'], textSearch: 'text' })

    expect(result).toEqual(wearables)
  })

  it('When fetching for wearables without filters, then an error should be raised', async () => {
    const client = buildClient(URL, undefined)

    await expect(async () => client.fetchWearables(undefined)).rejects.toThrow('You must set at least one filter')
  })

  it('When fetching for owned wearables without definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10 }]
    const { instance: fetcher } = mockFetcher(
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
    const { instance: fetcher } = mockFetcher(
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
    const { instance: fetcher } = mockFetcher(
      `/collections/emotes?textSearch=text&emoteId=id1&emoteId=id2`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchEmotes({ emoteIds: ['id1', 'id2'], textSearch: 'text' })

    expect(result).toEqual(emotes)
  })

  it('When fetching for emotes without filters, then an error should be raised', async () => {
    const client = buildClient(URL, undefined)

    await expect(async () => client.fetchEmotes(undefined)).rejects.toThrow('You must set at least one filter')
  })

  it('When fetching for owned emotes without definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10 }]
    const { instance: fetcher } = mockFetcher(
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
    const { instance: fetcher } = mockFetcher(
      `/collections/emotes-by-owner/${ethAddress}?includeDefinitions=true`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedEmotes(ethAddress, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned third party wearables with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const thirdPartyId = 'thirdPartyId'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]
    const { instance: fetcher } = mockFetcher(
      `/collections/wearables-by-owner/${ethAddress}?collectionId=thirdPartyId&includeDefinitions=true`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedThirdPartyWearables(ethAddress, thirdPartyId, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned third party emotes with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const thirdPartyId = 'thirdPartyId'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]
    const { instance: fetcher } = mockFetcher(
      `/collections/emotes-by-owner/${ethAddress}?collectionId=thirdPartyId&includeDefinitions=true`,
      requestResult
    )

    const client = buildClient(URL, fetcher)
    const result = await client.fetchOwnedThirdPartyEmotes(ethAddress, thirdPartyId, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching catalysts approved by DAO, then the result is as expected', async () => {
    const requestResult = [{ baseUrl: 'baseUrl', owner: 'owner', id: 'id' }]
    const { instance: fetcher } = mockFetcher(`/contracts/servers`, requestResult)
    const client = buildClient(URL, fetcher)

    const result = await client.fetchCatalystsApprovedByDAO()

    expect(result).toEqual(requestResult)
  })

  it('When fetching lambdas statuses, then the result is as expected', async () => {
    const requestResult = 'contentServerUrl'
    const { instance: fetcher } = mockFetcher(`/status`, requestResult)
    const client = buildClient(URL, fetcher)

    const result = await client.fetchLambdasStatus()

    expect(result).toEqual(requestResult)
  })

  it('When fetching peer health, then the result is as expected', async () => {
    const requestResult = {
      aKey: 'Healthy'
    }
    const { instance: fetcher } = mockFetcher(`/health`, requestResult)
    const client = buildClient(URL, fetcher)

    const result = await client.fetchPeerHealth()

    expect(result).toEqual(requestResult)
  })

  it('When retrieving lambdas url, then the result is as expected', () => {
    const client = buildClient(URL, undefined)

    const result = client.getLambdasUrl()

    expect(result).toEqual(URL)
  })

  function someResult() {
    return {
      someKey: 'someValue'
    }
  }

  function mockFetcher<T>(path?: string, result?: T): { mock: Fetcher; instance: Fetcher } {
    // Create mock
    const mockedFetcher: Fetcher = mock(Fetcher)

    if (path) {
      when(mockedFetcher.fetch(anything(), anything())).thenCall((url, _) => {
        expect(url).toEqual(`${URL}${path}`)
        return Promise.resolve({ json: () => result })
      })

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
