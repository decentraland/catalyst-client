# Quick Start: Deploy Profile Example

This guide shows you how to quickly run the profile deployment example.

## Installation

```bash
# Clone/navigate to the project
cd catalyst-client

# Install dependencies
yarn install

# Install ethers (required for the example)
yarn add -D ethers@5
```

## Running the Example

The script supports two modes:

### Mode A: Create New Profile (Default)

The script will generate a random wallet and deploy a test profile:

```bash
npx ts-node scripts/deploy-profile-example.ts
```

### Mode B: Copy Existing Profile

Copy an existing profile from one address and redeploy it to a new wallet:

```bash
# Copy a profile from a specific address
PROFILE_TO_COPY=0x1234567890123456789012345678901234567890 npx ts-node scripts/deploy-profile-example.ts
```

This is useful for:
- **Migrating profiles** between wallets
- **Testing deployments** with real profile data
- **Backing up profiles** to different servers
- **Cloning profiles** for development/testing

### Option 1: Test with Random Wallet (Default Mode A)

**Output (New Profile):**
```
🚀 Starting profile deployment...

🔑 Setting up wallet...
✅ Wallet address: 0x1234567890123456789012345678901234567890
⚠️  Using randomly generated wallet for testing
   Private key: 0xabcdef...

📡 Creating ContentClient...
✅ Connected to: https://peer.decentraland.org/content

👤 Preparing profile metadata...
✅ Profile created for: Sample User

🖼️  Preparing profile files...
✅ Prepared 2 files

🔨 Building deployment entity...
✅ Entity ID: bafkrei...
✅ Total files in deployment: 3

🔐 Creating authentication chain...
✅ Auth chain created with real wallet signature

📤 Deploying profile to content server...
✅ Profile deployed successfully!

🎉 New profile created!
   View at: https://peer.decentraland.org/content/entities/profile?pointer=0x...
```

**Output (Copied Profile):**
```
🚀 Starting profile deployment...

🔑 Setting up wallet...
✅ Wallet address: 0x9876543210987654321098765432109876543210

📡 Creating ContentClient...
✅ Connected to: https://peer.decentraland.org/content

📥 Downloading profile from: 0x1234567890123456789012345678901234567890...
   Fetching entity for pointer: 0x1234567890123456789012345678901234567890
   ✓ Found entity: bafkrei...
   ✓ Entity type: profile
   ✓ Content files: 2
   Downloading content files...
   ↓ Downloading: face256.png (bafkrei...)
   ✓ Downloaded: face256.png (12345 bytes)
   ↓ Downloading: body.png (bafkrei...)
   ✓ Downloaded: body.png (67890 bytes)
✅ Downloaded profile: Existing User Name
✅ Downloaded 2 files

🔄 Updating profile to new wallet address...
✅ Profile updated for new address

🔨 Building deployment entity...
✅ Entity ID: bafkrei...
✅ Total files in deployment: 3

🔐 Creating authentication chain...
✅ Auth chain created with real wallet signature

📤 Deploying profile to content server...
✅ Profile deployed successfully!

🎉 Profile copied from 0x1234567890123456789012345678901234567890 and redeployed!
   View at: https://peer.decentraland.org/content/entities/profile?pointer=0x9876...
```

### Option 2: Deploy with Your Own Wallet (Mode A - New Profile)

```bash
# Set your private key as environment variable
export PRIVATE_KEY="0xYourPrivateKeyHere"

# Edit the script to set USE_RANDOM_WALLET = false
# Or run with inline environment variable
PRIVATE_KEY=0xYourPrivateKeyHere npx ts-node scripts/deploy-profile-example.ts
```

### Option 3: Copy Profile to Your Wallet (Mode B - Copy Profile)

Copy your own profile or someone else's to a new wallet:

```bash
# Copy your profile to a new wallet (random)
PROFILE_TO_COPY=0xYourCurrentAddress npx ts-node scripts/deploy-profile-example.ts

# Copy a profile to your specific wallet
PROFILE_TO_COPY=0xSourceAddress PRIVATE_KEY=0xYourKey npx ts-node scripts/deploy-profile-example.ts
```

**Real-world example:**
```bash
# Copy profile from address 0xabc...123 to your wallet
PROFILE_TO_COPY=0xabc...123 PRIVATE_KEY=0xdef...456 npx ts-node scripts/deploy-profile-example.ts
```

**⚠️ Security Warning**: Never commit your private key or share it. Use environment variables or a `.env` file (and add it to `.gitignore`).

## What the Script Does

### Mode A: New Profile
1. **Creates/Loads Wallet** - Generates a random wallet or uses your private key
2. **Connects to Catalyst** - Creates a client connected to the Catalyst content server
3. **Prepares Profile Data** - Sets up avatar metadata (wearables, colors, etc.)
4. **Prepares Files** - Creates dummy avatar snapshot images
5. **Builds Entity** - Constructs the deployment with all files and metadata
6. **Signs with Wallet** - Creates a proper authentication chain using ECDSA signatures
7. **Deploys** - Uploads the profile to the content server

### Mode B: Copy Profile
1. **Creates/Loads Wallet** - Generates a random wallet or uses your private key (destination)
2. **Connects to Catalyst** - Creates a client connected to the Catalyst content server
3. **Downloads Profile** - Fetches existing profile entity from specified address
4. **Downloads Files** - Downloads all avatar snapshot files from the content server
5. **Updates Metadata** - Modifies profile to use new wallet's address
6. **Builds Entity** - Constructs the deployment with downloaded files and updated metadata
7. **Signs with Wallet** - Creates a proper authentication chain using ECDSA signatures
8. **Deploys** - Uploads the copied profile to the content server with new ownership

## Customization

### Change Catalyst Server

Edit in the script:
```typescript
const CATALYST_URL = 'https://peer.decentraland.zone/content'  // Testnet
// or
const CATALYST_URL = 'https://peer.decentraland.org/content'   // Mainnet
```

### Use Real Avatar Images

Replace the dummy files in `prepareProfileFiles()`:

```typescript
async function prepareProfileFiles() {
  const files = new Map<string, Uint8Array>()

  // Load your actual images
  files.set('face256.png', fs.readFileSync('./my-avatar/face256.png'))
  files.set('body.png', fs.readFileSync('./my-avatar/body.png'))

  return files
}
```

### Customize Profile Metadata

Edit the `createProfileMetadata()` function:

```typescript
const avatar: Avatar = {
  userId: ethAddress.toLowerCase(),
  name: 'Your Custom Name',
  description: 'Your custom description',
  // ... customize wearables, colors, etc.
  avatar: {
    wearables: [
      'urn:decentraland:matic:collections-v2:0xabc...:0',
      // Add your owned wearables
    ]
  }
}
```

## Authentication Implementation

The script uses **ethers.js** to create a real, valid authentication chain:

```typescript
import { Wallet } from 'ethers'
import { AuthLinkType } from '@dcl/schemas'

// Create wallet
const wallet = Wallet.createRandom()  // or new Wallet(privateKey)

// Sign the entity ID
const signature = await wallet.signMessage(entityId)

// Build auth chain
const authChain = [
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
```

This creates a **valid, production-ready signature** that proves you own the wallet address.

## Troubleshooting

### "Cannot find module 'ethers'"

Install ethers:
```bash
yarn add -D ethers@5
```

### "Invalid signature" or "Unauthorized"

- Make sure you're using the correct private key
- Verify the wallet address matches the profile pointer
- Check that the signature is being created correctly

### "Entity already exists"

This usually means the profile was already deployed with the same content. This is normal and doesn't prevent the deployment from succeeding.

### "Connection refused" or "Network error"

- Check your internet connection
- Verify the Catalyst server URL is correct
- Try a different Catalyst server

### "No profile found for address"

When copying a profile:
- Verify the address has a deployed profile
- Check the address format (should be 0x... format)
- Make sure you're querying the correct Catalyst server
- The address must be lowercase or checksummed correctly

### "Failed to download [filename]"

When copying a profile:
- The content file might not be available on this server
- Try a different Catalyst server
- Check network connectivity
- The content hash might be corrupted

## Next Steps

- **Customize the profile** with your own avatar data
- **Load real images** instead of dummy files
- **Deploy to testnet first** (peer.decentraland.zone)
- **Verify deployment** by fetching the profile via API
- **Integrate into your application** using the same patterns

## API Response

After successful deployment, you can fetch your profile:

```bash
curl "https://peer.decentraland.org/content/entities/profile?pointer=YOUR_ADDRESS"
```

Or programmatically:

```typescript
const entities = await contentClient.fetchEntitiesByPointers([ethAddress.toLowerCase()])
console.log(entities[0])
```

## Resources

- [Full README](./README-deploy-profile.md) - Detailed documentation
- [Catalyst API Specs](https://decentraland.github.io/catalyst-api-specs/)
- [DCL Schemas](https://github.com/decentraland/schemas)
- [Ethers.js Docs](https://docs.ethers.io/v5/)
