import cookie from 'cookie'
import { CrossFetchRequest, Fetcher } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { generateNonceForChallenge } from '../utils/ProofOfWork'

const LOGGER = log4js.getLogger('JWTPort')

export async function obtainJWT(fetcher: Fetcher, catalystUrl: string): Promise<string | undefined> {
  try {
    const response = (await fetcher.fetchJson(catalystUrl + '/pow-auth/challenge')) as any

    const challenge: string = response.challenge
    const complexity: number = response.complexity
    const nonce: string = await generateNonceForChallenge(challenge, complexity)

    const powAuthUrl = new URL('/pow-auth/challenge', catalystUrl).href
    const challengeBody = JSON.stringify({ challenge: challenge, complexity: complexity, nonce: nonce })
    const jwtResponse = (await fetcher.postForm(powAuthUrl, { body: challengeBody })) as any

    if (!jwtResponse.jwt) {
      LOGGER.warn('[POW] Could not get a JWT from Pow Auth Server.')
    }
    return jwtResponse.jwt
  } catch (error) {
    LOGGER.warn(`[POW] Could not get a JWT from Pow Auth Server, due to: ${error}`)
    return ''
  }
}

export function isJWTCookieRemoved(response: Response): boolean {
  try {
    const headers = response.headers
    if (headers) {
      const setCookie = headers.get('Set-Cookie')
      if (setCookie && setCookie.includes('JWT=')) {
        const cookies = cookie.parse(setCookie)
        return cookies.JWT === ''
      }
    }
    return false
  } catch {
    return false
  }
}

export function missingJWTInRequest(request: CrossFetchRequest): boolean {
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
  return cookies.JWT ?? '' !== ''
}

export function configureJWTMiddlewares(fetcher: Fetcher, baseUrl: string): void {
  let lastFailedPowEndpointTimestamp: number = 0
  let minutesToAdd: number = ms('5m')
  let isRequestingJWT: boolean = false
  fetcher.overrideDefaults({
    requestMiddleware: async (request: CrossFetchRequest) => {
      if (missingJWTInRequest(request) && !isRequestingJWT) {
        if (lastFailedPowEndpointTimestamp + minutesToAdd < Date.now()) {
          isRequestingJWT = true
          try {
            const jwt = await obtainJWT(fetcher, baseUrl)
            if (!!jwt) {
              fetcher.overrideDefaults({ cookies: { JWT: jwt } })
              lastFailedPowEndpointTimestamp = 0
              minutesToAdd = ms('5m')
            } else {
              lastFailedPowEndpointTimestamp = Date.now()
              minutesToAdd = 2 * minutesToAdd
            }
          } catch {
            LOGGER.warn('[POW] Could not configure Middleware to set JWT.')
          } finally {
            isRequestingJWT = false
          }
        }
      }
      return request
    },
    responseMiddleware: async (response: Response) => {
      if (isJWTCookieRemoved(response)) {
        // When executing the requestMiddleware it will get the new JWT
        fetcher.overrideDefaults({ cookies: { JWT: '' } })
      }
      return response
    }
  })
}
