# Profile Deployment Script

This directory contains example scripts demonstrating how to deploy a profile to a Decentraland Catalyst server using the ContentClient.

## Overview

The `deploy-profile-example.ts` script supports two modes:

### Mode A: Create New Profile
Deploy a brand new profile with custom metadata and avatar snapshots.

### Mode B: Copy Existing Profile
Download an existing profile from any address and redeploy it to a new wallet. This is useful for:
- Migrating profiles between wallets
- Backing up profiles to different servers
- Testing deployments with real profile data
- Cloning profiles for development

## Complete Flow

1. **Create/Load Wallet** - Generate random wallet or use private key
2. **Create ContentClient** - Connect to a Catalyst server
3. **Prepare Profile** - Either download existing profile OR create new metadata
4. **Prepare Files** - Either download existing files OR generate avatar snapshots
5. **Build Deployment** - Create the entity with all files and metadata
6. **Create Auth Chain** - Sign the deployment with your wallet
7. **Deploy** - Upload to the content server

## Prerequisites

```bash
# Install dependencies
yarn install

# Install ethers for wallet signing (required for this example)
yarn add -D ethers@5

# Build the project
yarn build
```

**Note:** This example script uses `ethers` for wallet signing, which is not included by default in the package to keep dependencies minimal. You can also use other signing methods (see the Authentication section below).

## Usage

### Basic Usage

**Create New Profile:**
```bash
npx ts-node scripts/deploy-profile-example.ts
```

**Copy Existing Profile:**
```bash
PROFILE_TO_COPY=0x1234567890123456789012345678901234567890 npx ts-node scripts/deploy-profile-example.ts
```

**Copy Profile to Your Wallet:**
```bash
PROFILE_TO_COPY=0xSourceAddress PRIVATE_KEY=0xYourPrivateKey npx ts-node scripts/deploy-profile-example.ts
```

### Programmatic Usage

```typescript
import { deployProfile, downloadProfile } from './scripts/deploy-profile-example'

// Deploy new profile
await deployProfile()

// Or download a profile separately
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createContentClient } from './src/client/ContentClient'

const fetcher = createFetchComponent()
const client = createContentClient({ url: 'https://peer.decentraland.org/content', fetcher })
const { metadata, files } = await downloadProfile(client, '0x1234...5678')
```

## Configuration

The script has two modes:

### Testing Mode (Default)
```typescript
const USE_RANDOM_WALLET = true  // Generate a random wallet for testing
```

When `USE_RANDOM_WALLET` is `true`, the script generates a random wallet and displays its private key. This is useful for testing without needing real credentials.

### Production Mode
```typescript
const USE_RANDOM_WALLET = false
const PRIVATE_KEY = process.env.PRIVATE_KEY  // Your wallet's private key
```

Set `USE_RANDOM_WALLET` to `false` and provide your private key via environment variable:

```bash
PRIVATE_KEY=0xYourPrivateKey npx ts-node scripts/deploy-profile-example.ts
```

⚠️ **NEVER commit your private key to version control!**

### Copy Profile Mode
```typescript
const PROFILE_TO_COPY = process.env.PROFILE_TO_COPY || ''
```

Set to an Ethereum address to download and copy that profile:

```bash
# Copy specific profile
PROFILE_TO_COPY=0x1234567890123456789012345678901234567890 npx ts-node scripts/deploy-profile-example.ts

# Copy profile to your wallet
PROFILE_TO_COPY=0xSourceAddress PRIVATE_KEY=0xDestinationKey npx ts-node scripts/deploy-profile-example.ts
```

When set, the script will:
1. Fetch the entity from the source address
2. Download all profile files (face256.png, body.png)
3. Update the metadata to use the new wallet's address
4. Redeploy with the new wallet's signature

### Other Configuration
```typescript
const CATALYST_URL = 'https://peer.decentraland.org/content'  // Catalyst server URL
```

## Authentication

✅ **This example now uses real wallet signatures with ethers.js!**

The auth chain is created using a proper ECDSA signature:

### Using @dcl/crypto

```typescript
import { Authenticator } from '@dcl/crypto'

async function createAuthChain(entityId: string, privateKey: string) {
  const authChain = Authenticator.signPayload(
    Authenticator.initializeAuthChain(
      ethAddress,
      ephemeralIdentity,
      60 * 60 * 24 * 7 // 1 week
    ),
    entityId
  )
  return authChain
}
```

### Current Implementation (ethers.js)

The script uses ethers.js to create a proper auth chain:

```typescript
import { Wallet } from 'ethers'
import { AuthLinkType } from '@dcl/schemas'

async function createAuthChain(wallet: Wallet, entityId: string): Promise<AuthChain> {
  // Sign the entity ID with the wallet
  const signature = await wallet.signMessage(entityId)

  // Build the auth chain
  const authChain: AuthChain = [
    {
      type: AuthLinkType.SIGNER,
      payload: wallet.address,
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: entityId,
      signature: signature
    }
  ]

  return authChain
}
```

### Using MetaMask (Browser)

```typescript
async function signWithMetaMask(entityId: string) {
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts'
  })
  const address = accounts[0]

  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [entityId, address]
  })

  return [
    {
      type: 'SIGNER',
      payload: address,
      signature: ''
    },
    {
      type: 'ECDSA_SIGNED_ENTITY',
      payload: entityId,
      signature: signature
    }
  ]
}
```

## Profile Files

Avatar snapshots are PNG images that represent your avatar:

- **face256.png** - 256x256px face snapshot
- **body.png** - Full body snapshot

### Loading from Files

```typescript
import fs from 'fs'
import path from 'path'

async function prepareProfileFiles() {
  const files = new Map<string, Uint8Array>()

  files.set('face256.png', fs.readFileSync('./assets/face256.png'))
  files.set('body.png', fs.readFileSync('./assets/body.png'))

  return files
}
```

### Generating Snapshots

For generating snapshots programmatically, you can:

1. Use the Decentraland avatar renderer
2. Generate them in Unity using the Decentraland SDK
3. Use a headless browser to capture the avatar from the Explorer

## Profile Metadata Structure

```typescript
{
  avatars: [{
    userId: string              // Ethereum address (lowercase)
    email?: string              // Optional email
    name: string                // Display name
    hasClaimedName: boolean     // Whether name is claimed on-chain
    description: string         // Profile description
    ethAddress: string          // Ethereum address (checksummed)
    version: number             // Profile version
    avatar: {
      bodyShape: string         // URN of body shape
      snapshots: {
        face256: string         // Hash of face snapshot
        body: string            // Hash of body snapshot
      },
      eyes: { color: RGB }      // Eye color
      hair: { color: RGB }      // Hair color
      skin: { color: RGB }      // Skin color
      wearables: string[]       // Array of wearable URNs
    },
    tutorialStep: number        // Tutorial progress
    interests: string[]         // User interests
  }]
}
```

## Testing

### Test on Sepolia Testnet

```typescript
const CATALYST_URL = 'https://peer.decentraland.zone/content'
```

### Verify Deployment

After deployment, you can verify your profile at:

```
https://peer.decentraland.org/content/entities/profile?pointer=YOUR_ETH_ADDRESS
```

## Example: Complete Production Script

```typescript
import { Wallet } from 'ethers'
import { EntityType, AuthChain, AuthLinkType } from '@dcl/schemas'
import { createContentClient } from '../src/client/ContentClient'
import { buildEntity } from '../src/client/utils/DeploymentBuilder'
import { createFetchComponent } from '@well-known-components/fetch-component'

async function deployProfileProduction() {
  // 1. Setup wallet from private key
  const wallet = new Wallet(process.env.PRIVATE_KEY!)
  const ethAddress = wallet.address

  // 2. Create client
  const fetcher = createFetchComponent()
  const client = createContentClient({
    url: 'https://peer.decentraland.org/content',
    fetcher
  })

  // 3. Prepare files and metadata
  const files = await loadProfileFiles()
  const metadata = createProfileMetadata(ethAddress)

  // 4. Build entity
  const { entityId, files: entityFiles } = await buildEntity({
    type: EntityType.PROFILE,
    pointers: [ethAddress.toLowerCase()],
    files,
    metadata,
    timestamp: Date.now()
  })

  // 5. Sign with wallet and create auth chain
  const signature = await wallet.signMessage(entityId)
  const authChain: AuthChain = [
    {
      type: AuthLinkType.SIGNER,
      payload: ethAddress,
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: entityId,
      signature
    }
  ]

  // 6. Deploy
  await client.deploy({
    entityId,
    files: entityFiles,
    authChain
  })

  console.log(`Profile deployed: ${ethAddress}`)
}
```

## Troubleshooting

### Common Errors

**"Invalid auth chain"**
- Make sure you're using a real wallet signature
- Verify the signature format matches the expected auth chain structure

**"Content already exists"**
- Files with the same hash already exist on the server (this is OK)
- The deployment should still succeed

**"Invalid entity"**
- Check that your metadata follows the Profile schema
- Ensure all required fields are present
- Validate wearable URNs are correct

**"Failed to upload"**
- Check network connection
- Verify the Catalyst server is reachable
- Try a different Catalyst server

## Resources

- [Catalyst API Documentation](https://decentraland.github.io/catalyst-api-specs/)
- [DCL Schemas](https://github.com/decentraland/schemas)
- [DCL Crypto](https://github.com/decentraland/crypto)
- [Avatar Documentation](https://docs.decentraland.org/creator/development-guide/sdk7/avatars/)

## License

Apache-2.0
