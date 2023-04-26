import { Authenticator } from "@dcl/crypto"
import { createCatalystClient } from "dcl-catalyst-client"
import { createFetchComponent } from "dcl-catalyst-client/dist/client/utils/fetcher"
import * as EthCrypto from "eth-crypto"
import { EntityType } from '@dcl/schemas'
import { PROFILE_METADATA, PROFILE_POINTERS } from "./data/inputs"

async function resolveClient() {
    // Build the client, Node is harcoded for simplicity
    const fetcher = createFetchComponent()
    const catalyst = await createCatalystClient({ url: "https://peer-ec2.decentraland.org", fetcher })

    return await catalyst.getContentClient()
}

async function run(params: { identity: { privateKey: string, address: string } }) {
    const { identity } = params

    const content = await resolveClient()

    const { entityId, files } = await content.buildEntity({
        type: EntityType.PROFILE,
        pointers: PROFILE_POINTERS,
        metadata: PROFILE_METADATA
    })

    // This is up to you. You will need to figure out how to make the owner of the pointer sign the entity id
    const messageHash = Authenticator.createEthereumMessageHash(entityId)
    const signature = EthCrypto.sign(identity.privateKey, Buffer.from(messageHash).toString("hex"))

    // You can then create a simple auth chain like this, or a more complex one.
    const authChain = Authenticator.createSimpleAuthChain(entityId, identity.address, signature)
    const deployData = { entityId, files, authChain }

    // Deploy the actual entity
    await content.deploy(deployData)
}

const receivedParams = {
    identity: { privateKey: 'privatekey', address: '0xfbf2b0392d969db533189b596708ba9ba7f4e3cd' }
}

run(receivedParams)
