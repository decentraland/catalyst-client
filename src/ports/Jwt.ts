import { Fetcher } from 'dcl-catalyst-commons'
import { isNode } from '../utils/Helper'
import { generateNonceForChallenge } from '../utils/ProofOfWork'
import NodeFormData from 'form-data'
import cookie from 'cookie'

export async function obtainJWT(fetcher: Fetcher, catalystUrl: string): Promise<string | undefined> {
  const response = await fetcher.fetchJson(catalystUrl + '/pow-auth/challenge')
  const body = JSON.parse(response).body

  const challenge = body.challenge
  const complexity = body.complexity
  const nonce: string = await generateNonceForChallenge(challenge, complexity)

  // Check if we are running in node or browser
  const areWeRunningInNode = isNode()
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const form: FormData = areWeRunningInNode ? new NodeFormData() : new FormData()
  form.append('challenge', challenge)
  form.append('complexity', complexity)
  form.append('nonce', nonce)

  const jwtResponse = await fetcher.postForm(catalystUrl + '/pow-auth/challenge', { body: form })

  const setCookie: string = jwtResponse.headers['Set-Cookie']
  const cookies = cookie.parse(setCookie || '')
  return cookies.JWT
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
  const setCookie = response.headers.get('Set-Cookie')
  if (setCookie && setCookie.includes('JWT=')) {
    const cookies = cookie.parse(setCookie)
    return cookies.JWT == ''
  }
  return false
}
