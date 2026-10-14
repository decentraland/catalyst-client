import { FetchResponse, IFetchComponent } from '../../src/client/types'
import { useCustomClient } from '../../src/client/utils/fetcher'

describe('when calling a lambdas operation through the custom client', () => {
  let fetchMock: jest.Mock
  let json: jest.Mock
  let fetcher: IFetchComponent
  let result: unknown

  beforeEach(() => {
    json = jest.fn().mockResolvedValueOnce({ ok: true })
    fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json } as unknown as FetchResponse)
    fetcher = { fetch: fetchMock }
  })

  describe('and the operation is a GET with array, numeric and undefined query params', () => {
    beforeEach(async () => {
      result = await useCustomClient<{ ok: boolean }>({
        url: '/lambdas/users/0xabc/third-party-wearables',
        method: 'get',
        params: { category: ['hat', 'eyewear'], pageNum: 2, name: undefined }
      })('https://peer.example.org/lambdas', fetcher)
    })

    it('should send each array item as a repeated key, stringify numbers and leave undefined values out', () => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://peer.example.org/lambdas/users/0xabc/third-party-wearables?category=hat&category=eyewear&pageNum=2',
        { method: 'get', headers: undefined }
      )
    })

    it('should resolve with the parsed JSON body', () => {
      expect(result).toEqual({ ok: true })
    })
  })

  describe('and the query params hold null, booleans, an empty array and reserved characters', () => {
    beforeEach(async () => {
      await useCustomClient<{ ok: boolean }>({
        url: '/lambdas/users/0xabc/wearables',
        method: 'get',
        params: { includeDefinitions: null, includeEntities: true, category: [], name: 'a&b=c #d' }
      })('https://peer.example.org/lambdas', fetcher)
    })

    it('should leave null and empty arrays out, stringify booleans and encode reserved characters', () => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://peer.example.org/lambdas/users/0xabc/wearables?includeEntities=true&name=a%26b%3Dc+%23d',
        { method: 'get', headers: undefined }
      )
    })
  })

  describe('and the operation is a HEAD', () => {
    beforeEach(async () => {
      result = await useCustomClient<void>({
        url: '/lambdas/collections/contents/urn:decentraland:off-chain:base-avatars:eyebrows_00/thumbnail',
        method: 'head'
      })('https://peer.example.org/lambdas', fetcher)
    })

    it('should send a HEAD request', () => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://peer.example.org/lambdas/collections/contents/urn:decentraland:off-chain:base-avatars:eyebrows_00/thumbnail?',
        { method: 'head', headers: undefined }
      )
    })

    it('should not parse the response body', () => {
      expect(json).not.toHaveBeenCalled()
    })

    it('should resolve with undefined', () => {
      expect(result).toBeUndefined()
    })
  })
})
