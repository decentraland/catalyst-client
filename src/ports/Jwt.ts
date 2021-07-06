import { Fetcher } from 'dcl-catalyst-commons'
import { isNode } from '../utils/Helper'
import { generateNonceForChallenge } from '../utils/ProofOfWork'
import NodeFormData from 'form-data'
import cookie from 'cookie'

export async function obtainJWT(fetcher: Fetcher, catalystUrl: string): Promise<string> {
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
  try {
    return jwtResponse.headers['Set-Cookie'].replace(/\s/g, '').split('JWT=')[1].split(';')[0]
  } catch (e) {
    return ''
  }
}

export function removedJWTCookie(response: Response): boolean {
  const setCookie = response.headers.get('Set-Cookie')
  if (setCookie && setCookie.includes('JWT=')) {
    const cookies = cookie.parse(setCookie)
    return cookies.JWT == ''
  }
  return false
}
