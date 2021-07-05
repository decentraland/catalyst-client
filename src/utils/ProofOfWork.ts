// Code copied from https://github.com/decentraland/pow-authorization-server

// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto')

export async function generateNonceForChallenge(challenge, complexity): Promise<string> {
  while (true) {
    const nonce = crypto.randomBytes(256).toString('hex')
    const a = challenge + nonce
    const hash = await crypto.createHash('sha256').update(a, 'hex').digest('hex')

    const isValid = hash.startsWith('0'.repeat(complexity))

    if (isValid) {
      return nonce
    }
  }
}
