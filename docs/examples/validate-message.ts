import { AuthLink, AuthLinkType } from "@dcl/schemas"
import { createValidator } from "dcl-catalyst-client/dist/crypto/validate"

async function run() {
    const authChain: AuthLink[] = [
        { type: AuthLinkType.SIGNER, payload: '' },
        { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload: '' },
        { type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL, payload: '' }
    ]
    const validator = createValidator()
    return validator.validateMessage({ signedMessage: 'any-message', authChain})
}

run()