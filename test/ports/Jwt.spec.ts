import { Fetcher } from 'dcl-catalyst-commons'
import { obtainJWT, removedJWTCookie } from '../../src/ports/Jwt'
import * as pow from '../../src/utils/ProofOfWork'

describe('Proof of Work: generate JWT', () => {
  const catalystUrl = 'localhost'

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
      .mockImplementation(() => Promise.resolve('{ "body": {  "challenge": "aChallenge", "complexity": 4}}'))

    postFormSpy = jest.spyOn(fetcher, 'postForm')
    postFormSpy.mockImplementation(() => Promise.resolve({ headers: { 'Set-Cookie': 'JWT=aJWT' } }))

    powSpy = jest.spyOn(pow, 'generateNonceForChallenge')
    powSpy.mockImplementation(() => Promise.resolve('aNonce'))
  })

  beforeEach(async () => {
    jwt = await obtainJWT(fetcher, catalystUrl)
  })

  it('should get a challenge from the pow-auth server', async () => {
    expect(fetcher.fetchJson).toHaveBeenCalledWith('localhost/pow-auth/challenge')
  })

  it('should solve the challenge with the correct parameters', async () => {
    expect(powSpy.mock.calls[0][0]).toBe('aChallenge')
    expect(powSpy.mock.calls[0][1]).toBe(4)
  })

  it('should post the solved challenge', async () => {
    const formParam = postFormSpy.mock.calls[0][1]
    expect(formParam.body._streams).toContain('aChallenge')
    expect(formParam.body._streams).toContain('4')
    expect(formParam.body._streams).toContain('aNonce')
  })

  it('should return the jwt as string', async () => {
    expect(jwt).toEqual('aJWT')
  })
})

describe('removedJWTCookie', () => {
  describe('No JWT is in cookie', () => {
    const response: Response = new Response()
    it('should return false', async () => {
      const isRemoved = removedJWTCookie(response)

      expect(isRemoved).toBeFalsy()
    })
  })
  describe('JWT has a value', () => {
    const response: Response = new Response()
    response.headers.set('Set-Cookie', 'JWT=aValue;anotherCookie=value')

    it('should return false', async () => {
      const isRemoved = removedJWTCookie(response)

      expect(isRemoved).toBeFalsy()
    })
  })
  describe('JWT has empty string', () => {
    const response: Response = new Response()
    response.headers.set('Set-Cookie', 'JWT=;anotherCookie=value')

    it('should return true', async () => {
      const isRemoved = removedJWTCookie(response)

      expect(isRemoved).toBeTruthy()
    })
  })
})
