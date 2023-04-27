# Decentraland Catalyst Client

Welcome to the Catalyst Client library. This client can be used to interact with Decentraland's [Catalyst servers](https://github.com/decentraland/catalyst). You can both fetch data, or deploy new entities to the server you specify.

## Installation

```bash
npm install dcl-catalyst-client
```

### Implementations

The examples in this document illustrate the implementation of common workflows using the second version of `catalyst-client`.

#### Connect to random Catalyst

The following section outlines the steps to successfully connect to a random catalyst when there is no need to communicate with any particular node.

```javascript
import { connectedToRandomCatalyst } from 'dcl-catalyst-client'
import { getCatalystServersFromCache } from './../dist/contracts-snapshots/index'
import { createFetchComponent } from './../dist/client/utils/fetcher'

// Connect to a catalyst randomly choosen from the catalyst-client snapshot
const fetcher = createFetchComponent()
const nodes = getCatalystServersFromCache('mainnet')
const catalyst = await connectedToRandomCatalyst(nodes, { fetcher })

if (!catalyst) {
  console.log('No catalyst node is available right now')
  return
}

const catalystInfo = await catalyst.fetchAbout()
const contentClient = await catalyst.getContentClient()
const lambdasClient = await catalyst.getLambdasClient()
```

#### Deploy an entity

The following section outlines the steps to deploy an entity to the Decentraland network.

```javascript
import { Authenticator } from '@dcl/crypto'
import { createCatalystClient } from 'dcl-catalyst-client'
import { createFetchComponent } from 'dcl-catalyst-client/dist/client/utils/fetcher'
import * as EthCrypto from 'eth-crypto'
import { EntityType } from '@dcl/schemas'
import { PROFILE_METADATA, PROFILE_POINTERS } from './data/inputs'

async function resolveClient() {
  // Build the client, Node is harcoded for simplicity
  const fetcher = createFetchComponent()
  const catalyst = await createCatalystClient({ url: 'https://peer-ec2.decentraland.org', fetcher })

  return await catalyst.getContentClient()
}

const identity = { privateKey: 'privatekey', address: '0xfbf2b0392d969db533189b596708ba9ba7f4e3cd' }

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
```
