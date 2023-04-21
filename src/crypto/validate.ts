import { Authenticator, AuthLink, ValidationResult } from '@dcl/crypto'
import { HTTPProvider } from 'eth-connect'

export type Message = {
  signedMessage: string
  authChain: AuthLink[]
}

export function createValidator(provider?: HTTPProvider) {
  provider = provider || new HTTPProvider('https://rpc.decentraland.org/mainnet?project=catalyst-client-validator')

  async function validateMessage({ signedMessage, authChain }: Message) {
    const result: ValidationResult = await Authenticator.validateSignature(signedMessage, authChain, provider)

    return {
      valid: result.ok,
      ownerAddress: result.ok ? Authenticator.ownerAddress(authChain) : undefined,
      error: result.message
    }
  }

  return {
    validateMessage
  }
}
