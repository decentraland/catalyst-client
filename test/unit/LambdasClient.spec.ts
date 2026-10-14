import { createLambdasClient } from '../../src/client/LambdasClient'
import { FetchResponse, IFetchComponent } from '../../src/client/types'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function imageResponse(contentType?: string): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token in JSON')),
    text: jest.fn(),
    arrayBuffer: jest.fn().mockResolvedValue(PNG_BYTES.buffer.slice(0)),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType ?? null : null) }
  }
}

describe('when downloading item images with the lambdas client', () => {
  let fetcher: IFetchComponent
  let response: FetchResponse
  let blob: Blob
  let bytes: Uint8Array

  describe.each([
    ['thumbnail', 'getThumbnail' as const],
    ['image', 'getImage' as const]
  ])('and requesting the %s', (path, operation) => {
    describe('and the server sends a content type', () => {
      beforeEach(async () => {
        response = imageResponse('image/png')
        fetcher = { fetch: jest.fn().mockResolvedValue(response) }
        blob = await createLambdasClient({ url: 'https://peer.example.com/lambdas', fetcher })[operation]('urn:x')
        bytes = new Uint8Array(await blob.arrayBuffer())
      })

      it('should request the content path of the urn', () => {
        expect(fetcher.fetch).toHaveBeenCalledWith(
          `https://peer.example.com/lambdas/collections/contents/urn:x/${path}?`,
          expect.objectContaining({ method: 'get' })
        )
      })

      it('should resolve with the image bytes instead of parsing them as JSON', () => {
        expect({ bytes: Array.from(bytes), jsonCalls: (response.json as jest.Mock).mock.calls.length }).toEqual({
          bytes: Array.from(PNG_BYTES),
          jsonCalls: 0
        })
      })

      it('should keep the content type of the response', () => {
        expect(blob.type).toBe('image/png')
      })
    })

    describe('and the server sends no content type', () => {
      beforeEach(async () => {
        response = imageResponse()
        fetcher = { fetch: jest.fn().mockResolvedValue(response) }
        blob = await createLambdasClient({ url: 'https://peer.example.com/lambdas', fetcher })[operation]('urn:x')
      })

      it('should resolve with an untyped blob of the bytes', () => {
        expect({ size: blob.size, type: blob.type }).toEqual({ size: PNG_BYTES.byteLength, type: '' })
      })
    })
  })
})
