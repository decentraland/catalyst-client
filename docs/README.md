# Catalyst Client implementation examples

The examples in this document illustrate the implementation of common workflows using the second version of `catalyst-client`.

## Coonect to random Catalyst

The following section outlines the steps to successfully connect to a random catalyst when there is no need to communicate with any particular node.

```javascript
async function run() {
  // Connect to a catalyst randomly choosen from the catalyst-client snapshot
  const fetcher = createFetchComponent()
  const nodes = getCatalystServersFromCache('mainnet')
  const catalyst = await connectedToRandomCatalyst(nodes, { fetcher })
  const catalystInfo = await catalyst?.getAbout(100)
  const contentClient = await catalyst?.getContentClient()
  const lambdasClient = await catalyst?.getLambdasClient()

  return { catalystInfo, contentClient, lambdasClient }
}
```

_Refer to its [implementation file](./examples/connect-to-random-catalyst.ts) for more details._

## Deploy

The following section outlines the steps to deploy an entity to the Decentraland network.

```javascript
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
  const signature = EthCrypto.sign(identity.privateKey, Buffer.from(messageHash).toString('hex'))

  // You can then create a simple auth chain like this, or a more complex one.
  const authChain = Authenticator.createSimpleAuthChain(entityId, identity.address, signature)
  const deployData = { entityId, files, authChain }

  // Deploy the actual entity
  await content.deploy(deployData)
}
```

_Refer to its [implementation file](./examples/deploy.ts) for more details._
