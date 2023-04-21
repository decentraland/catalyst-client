# Decentraland Catalyst Client

Welcome to the Catalyst Client library. This client can be used to interact with Decentraland's [Catalyst servers](https://github.com/decentraland/catalyst). You can both fetch data, or deploy new entities to the server you specify.

## Installation

```bash
npm install dcl-catalyst-client
```

### Deploying

One of the most important aspects, is the ability to deploy new entities. Here is an example of how to do it:

```
import { CatalystClient } from 'dcl-catalyst-client'
import { EntityType } from '@dcl/schemas'
import { Authenticator } from '@dcl/crypto'

// This is up to you. You will need to figure out how to make the owner of the pointer sign the entity id
const { signature, address } = await sign(entityId)

// You can then create a simple auth chain like this, or a more complex one.
const authChain = Authenticator.createSimpleAuthChain(entityId, address, signature)

// Build the client
const catalyst = await CatalystClient.connectedToCatalystIn('mainnet')
// Note: this operation is expensive, so try to store the created catalyst client somewhere, instead of re-building for each every request

// Build entity and group all files
const { entityId, files } = await catalyst.buildEntity({type: EntityType.*, pointers, files: contentFiles, metadata })

// Build the deploy data
const deployData = { entityId, files, authChain }

// Deploy the actual entity
await catalyst.deployEntity(deployData)

```
