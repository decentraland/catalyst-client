import cookie from 'cookie'
import { Fetcher } from 'dcl-catalyst-commons'
import { generateNonceForChallenge } from '../utils/ProofOfWork'

export async function obtainJWT(fetcher: Fetcher, catalystUrl: string): Promise<string | undefined> {
  const response = await fetcher.fetchJson(catalystUrl + '/pow-auth/challenge')
  const body = JSON.parse(JSON.stringify(response))

  const challenge: string = body.challenge
  const complexity: number = body.complexity
  const nonce: string = await generateNonceForChallenge(challenge, complexity)

  const powAuthUrl = new URL('/pow-auth/challenge', catalystUrl).href
  const challengeBody = JSON.stringify({ challenge: challenge, complexity: complexity, nonce: nonce })
  const jwtResponse = await fetcher.postForm(powAuthUrl, { body: challengeBody })

  return jwtResponse.jwt
}

export async function obtainJWTWithRetry(fetcher: Fetcher, catalystUrl: string, maxRetries: number): Promise<string> {
  let jwt = await obtainJWT(fetcher, catalystUrl)
  const retries = 0
  while (!jwt && retries < maxRetries) {
    jwt = await obtainJWT(fetcher, catalystUrl)
  }
  return jwt || ''
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

export async function setJWTAsCookie(fetcher: Fetcher, baseUrl: string): Promise<void> {
  console.log('OBTAINING JWT...')
  const jwt = await obtainJWTWithRetry(fetcher, baseUrl, 3)
  console.log(`JWT=${jwt}`)
  fetcher.overrideDefaults({ cookies: { JWT: jwt } })
  fetcher.overrideSetImmediate(async (response: Response) => {
    if (removedJWTCookie(response)) {
      console.log('JWT INVALIDATE, OBTAINING NEW ONE')
      const jwt = await obtainJWT(fetcher, baseUrl)
      console.log(`JWT=${jwt}`)
      if (!!jwt) {
        fetcher.overrideDefaults({ cookies: { JWT: jwt } })
      }
    }
  })
}
