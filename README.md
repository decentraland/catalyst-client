# Decentraland Catalyst Client

Welcome to the Catalyst Client library. This client can be used to interact with Decentraland's [Catalyst servers](https://github.com/decentraland/catalyst). You can both fetch data, or deploy new entities to the server you specify.

## Installation

```bash
npm install dcl-catalyst-client
```

## Usage

You can check the entire API [here](src/CatalystAPI.ts).

This library depends on two other Decentraland libraries:
* [Decentraland Crypto](https://github.com/decentraland/decentraland-crypto/)
* [Catalyst Commons](https://github.com/decentraland/catalyst-commons/)

### Deploying

One of the most important aspects, is the ability to deploy new entities. Here is an example of how to do it:

```
import { CatalystClient, DeploymentBuilder } from 'dcl-catalyst-client'
import { EntityType } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'

// Build entity and group all files
const { entityId, files } = await DeploymentBuilder.buildEntity(EntityType.*, pointers, contentFiles, metadata)

// This is up to you. You will need to figure out how to make the owner of the pointer sign the entity id
const { signature, address } = await sign(entityId)

// You can then create a simple auth chain like this, or a more complex one.
const authChain = Authenticator.createSimpleAuthChain(entityId, address, signature)

// Build the client
const contentServerAddress = 'https://peer.decentraland.org'
const origin = 'name_of_my_app'
const catalyst = new CatalystClient(contentServerAddress, origin)

// Build the deploy data
const deployData = { entityId, files, authChain }

// Deploy the actual entity
await catalyst.deployEntity(deployData)

```