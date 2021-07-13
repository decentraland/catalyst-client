import cookie from 'cookie'
import { CrossFetchRequest, Fetcher } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { generateNonceForChallenge } from '../utils/ProofOfWork'

const LOGGER = log4js.getLogger('JWTPort')

export async function obtainJWT(fetcher: Fetcher, catalystUrl: string): Promise<string | undefined> {
  try {
    const response = await fetcher.fetchJson(catalystUrl + '/pow-auth/challenge')
    const body = JSON.parse(JSON.stringify(response))

    const challenge: string = body.challenge
    const complexity: number = body.complexity
    const nonce: string = await generateNonceForChallenge(challenge, complexity)

    const powAuthUrl = new URL('/pow-auth/challenge', catalystUrl).href
    const challengeBody = JSON.stringify({ challenge: challenge, complexity: complexity, nonce: nonce })
    const jwtResponse = await fetcher.postForm(powAuthUrl, { body: challengeBody })

    if (!jwtResponse.jwt) {
      LOGGER.warn('[POW] Could not get a JWT from Pow Auth Server.')
    }
    return jwtResponse.jwt
  } catch (error) {
    LOGGER.warn(`[POW] Could not get a JWT from Pow Auth Server, due to: ${error}`)
    return ''
  }
}

export function removedJWTCookie(response: Response): boolean {
  try {
    const headers = response.headers
    if (headers) {
      const setCookie = headers.get('Set-Cookie')
      if (setCookie && setCookie.includes('JWT=')) {
        const cookies = cookie.parse(setCookie)
        return cookies.JWT == ''
      }
    }
    return false
  } catch {
    return false
  }
}

export function noJWTinCookie(request: CrossFetchRequest): boolean {
  const headers: Headers | string[][] | Record<string, string> | undefined = request.requestInit?.headers

  if (!!headers) {
    if (headers instanceof Headers) {
      return !hasJWTCookie(headers.get('Cookie') ?? '')
    } else if (Array.isArray(headers)) {
      return !headers.find((a) => {
        a[0] == 'Cookie' && hasJWTCookie(a[1])
      })
    } else {
      return !hasJWTCookie(headers.Cookie ?? '')
    }
  } else {
    return true
  }
}

function hasJWTCookie(cookieValue: string): boolean {
  const cookies = cookie.parse(cookieValue)
  return cookies.JWT ?? '' != ''
}

export async function setJWTAsCookie(fetcher: Fetcher, baseUrl: string): Promise<void> {
  const jwt = await obtainJWT(fetcher, baseUrl)
  if (!!jwt) {
    fetcher.overrideDefaults({ cookies: { JWT: jwt } })
  }
  let lastFailedPowEndpointTimestamp = 0
  let minutesToAdd = 5
  fetcher.setMiddleware({
    requestMiddleware: async (request: CrossFetchRequest) => {
      if (noJWTinCookie(request)) {
        if (lastFailedPowEndpointTimestamp + minutesToAdd * 60000 < Date.now()) {
          const jwt = await obtainJWT(fetcher, baseUrl)
          if (!!jwt) {
            fetcher.overrideDefaults({ cookies: { JWT: jwt } })
            lastFailedPowEndpointTimestamp = 0
            minutesToAdd = 5
          } else {
            lastFailedPowEndpointTimestamp = Date.now()
            minutesToAdd = 2 * minutesToAdd
          }
        }
      }
      return request
    },
    responseMiddleware: async (response: Response) => {
      if (removedJWTCookie(response)) {
        // When executing the requestMiddleware it will get the new JWT
        fetcher.overrideDefaults({ cookies: { JWT: '' } })
      }
      return response
    }
  })
}
