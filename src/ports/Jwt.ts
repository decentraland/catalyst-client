import cookie from 'cookie'
import { CrossFetchRequest, Fetcher } from 'dcl-catalyst-commons'
import { generateNonceForChallenge } from '../utils/ProofOfWork'

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

    return jwtResponse.jwt
  } catch {
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
  fetcher.setMiddleware({
    requestMiddleware: async (request: CrossFetchRequest) => {
      if (noJWTinCookie(request)) {
        const jwt = await obtainJWT(fetcher, baseUrl)
        if (!!jwt) {
          fetcher.overrideDefaults({ cookies: { JWT: jwt } })
        }
      }
      return request
    },
    responseMiddleware: async (response: Response) => {
      if (removedJWTCookie(response)) {
        const jwt = await obtainJWT(fetcher, baseUrl)
        if (!!jwt) {
          fetcher.overrideDefaults({ cookies: { JWT: jwt } })
        }
      }
      return response
    }
  })
}
