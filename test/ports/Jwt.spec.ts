import { CrossFetchRequest, Fetcher } from 'dcl-catalyst-commons'
import { isJWTCookieRemoved, missingJWTInRequest, obtainJWT } from '../../src/ports/Jwt'
import { sanitizeUrl } from '../../src/utils/Helper'
import * as pow from '../../src/utils/ProofOfWork'

describe('Proof of Work: generate JWT', () => {
  const catalystUrl = sanitizeUrl('localhost')

  const fetcher = new Fetcher()
  let powSpy: jest.SpyInstance
  let postFormSpy: jest.SpyInstance
  let jwt: string

  afterAll(() => {
    jest.resetAllMocks()
  })

  beforeAll(() => {
    jest
      .spyOn(fetcher, 'fetchJson')
      .mockImplementation(() => Promise.resolve({ complexity: 4, challenge: 'aChallenge' }))

    postFormSpy = jest.spyOn(fetcher, 'postForm')
    postFormSpy.mockImplementation(() => Promise.resolve({ jwt: 'aJWT' }))

    powSpy = jest.spyOn(pow, 'generateNonceForChallenge')
    powSpy.mockImplementation(() => Promise.resolve('aNonce'))
  })

  beforeEach(async () => {
    jwt = (await obtainJWT(fetcher, catalystUrl)) || ''
  })

  it('should get a challenge from the pow-auth server', async () => {
    expect(fetcher.fetchJson).toHaveBeenCalledWith('https://localhost/pow-auth/challenge')
  })

  it('should solve the challenge with the correct parameters', async () => {
    expect(powSpy.mock.calls[0][0]).toBe('aChallenge')
    expect(powSpy.mock.calls[0][1]).toBe(4)
  })

  it('should post the solved challenge', async () => {
    const bodyParam = postFormSpy.mock.calls[0][1]
    const sentBody = JSON.parse(JSON.stringify(bodyParam))
    const body = JSON.parse(sentBody.body)

    expect(body.challenge).toEqual('aChallenge')
    expect(body.complexity).toEqual(4)
    expect(body.nonce).toEqual('aNonce')
  })

  it('should return the jwt as string', async () => {
    expect(jwt).toEqual('aJWT')
  })
})

describe('isJWTCookieRemoved', () => {
  describe('No JWT is in cookie', () => {
    const response: Response = new Response()
    it('should return false', async () => {
      const isRemoved = isJWTCookieRemoved(response)

      expect(isRemoved).toBeFalsy()
    })
  })
  describe('JWT has a value', () => {
    const response: Response = new Response()
    response.headers.set('Set-Cookie', 'JWT=aValue;anotherCookie=value')

    it('should return false', async () => {
      const isRemoved = isJWTCookieRemoved(response)

      expect(isRemoved).toBeFalsy()
    })
  })
  describe('JWT has empty string', () => {
    const response: Response = new Response()
    response.headers.set('Set-Cookie', 'JWT=;anotherCookie=value')

    it('should return true', async () => {
      const isRemoved = isJWTCookieRemoved(response)

      expect(isRemoved).toBeTruthy()
    })
  })
})

describe('missingJWTInRequest', () => {
  describe('No JWT is in cookie', () => {
    const request: CrossFetchRequest = { requestInfo: '/bla', requestInit: { headers: {} } }
    it('should return true', async () => {
      const notJWTCookie = missingJWTInRequest(request)

      expect(notJWTCookie).toBeTruthy()
    })
  })
  describe('JWT has a value', () => {
    const request: CrossFetchRequest = {
      requestInfo: '/bla',
      requestInit: { headers: { Cookie: 'JWT=aValue;anotherCookie=value' } }
    }

    it('should return false', async () => {
      const notJWTCookie = missingJWTInRequest(request)

      expect(notJWTCookie).toBeFalsy()
    })
  })
  describe('JWT has empty string', () => {
    const request: CrossFetchRequest = {
      requestInfo: '/bla',
      requestInit: { headers: { Cookie: 'JWT=;anotherCookie=value' } }
    }

    it('should return true', async () => {
      const notJWTCookie = missingJWTInRequest(request)

      expect(notJWTCookie).toBeTruthy()
    })
  })
})
