import { createLambdasClient, LambdasClient } from '../src'
import { IFetchComponent } from '../src/client/types'
import { createFetchComponent } from '../src/client/utils/fetcher'

describe('LambdasClient', () => {
  const URL = 'https://url.com'

  it('When fetching for many profiles, then the result is as expected', async () => {
    const requestResult = [someResult()]
    const [ethAddress1, ethAddress2] = ['ethAddress1', 'ethAddress2']

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })

    const client = buildClient(URL, customFetcher)
    const result = await client.fetchProfiles([ethAddress1, ethAddress2])

    expect(result).toEqual(requestResult)
  })

  it('When fetching for no profiles, result should eagerly return empty without calling API', async () => {
    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce([])
    })

    const client = buildClient(URL, customFetcher)
    const result = await client.fetchProfiles([])

    expect(result.length).toBe(0)
    expect(customFetcher.fetch).not.toHaveBeenCalled()
  })

  it('When fetching for wearables, then the result is as expected', async () => {
    const wearables = [{ id: 'wearableId' }]
    const requestResult = {
      wearables,
      pagination: { offset: 0, limit: 0, moreData: false }
    }

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)
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

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedWearables(ethAddress, false)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned wearables with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedWearables(ethAddress, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for emotes, then the result is as expected', async () => {
    const emotes = [{ id: 'emoteId' }]
    const requestResult = {
      emotes,
      pagination: { offset: 0, limit: 0, moreData: false }
    }

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

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

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedEmotes(ethAddress, false)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned emotes with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedEmotes(ethAddress, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned third party wearables with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const thirdPartyId = 'thirdPartyId'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedThirdPartyWearables(ethAddress, thirdPartyId, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching for owned third party emotes with definition, then the result is as expected', async () => {
    const ethAddress = 'ethAddress'
    const thirdPartyId = 'thirdPartyId'
    const requestResult = [{ urn: 'urn', amount: 10, definition: {} }]

    const customFetcher = createFetchComponent()
    customFetcher.fetch = jest.fn().mockResolvedValueOnce({
      json: jest.fn().mockReturnValueOnce(requestResult)
    })
    const client = buildClient(URL, customFetcher)

    const result = await client.fetchOwnedThirdPartyEmotes(ethAddress, thirdPartyId, true)

    expect(result).toEqual(requestResult)
  })

  it('When fetching catalysts approved by DAO, then the result is as expected', async () => {
    const requestResult = [{ baseUrl: 'baseUrl', owner: 'owner', id: 'id' }]
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })
    const client = buildClient(URL, fetcher)

    const result = await client.fetchCatalystsApprovedByDAO()

    expect(result).toEqual(requestResult)
  })

  it('When fetching lambdas statuses, then the result is as expected', async () => {
    const requestResult = 'contentServerUrl'
    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValueOnce({ json: () => requestResult })
    const client = buildClient(URL, fetcher)

    const result = await client.fetchLambdasStatus()

    expect(result).toEqual(requestResult)
  })

  function someResult() {
    return {
      someKey: 'someValue'
    }
  }

  function buildClient(url: string, fetcher: IFetchComponent): LambdasClient {
    return createLambdasClient({ url, fetcher })
  }
})
