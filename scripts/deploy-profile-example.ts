/**
 * Example script demonstrating how to deploy a profile using the ContentClient
 *
 * This script can either:
 * A) Copy an existing profile from an address and redeploy it (useful for migrations/testing)
 * B) Create a new profile from scratch
 *
 * Complete flow:
 * 1. Create/load wallet (random or from private key)
 * 2. Create ContentClient and connect to Catalyst server
 * 3. Either download existing profile OR create new profile metadata
 * 4. Build the deployment entity with all files and metadata
 * 5. Sign the deployment with wallet (create auth chain)
 * 6. Deploy the profile to the content server
 *
 * Prerequisites:
 * - Install ethers: yarn add -D ethers@5
 *
 * Usage:
 * - Create new profile: npx ts-node scripts/deploy-profile-example.ts
 * - Copy existing profile: PROFILE_TO_COPY=0x1234...5678 npx ts-node scripts/deploy-profile-example.ts
 *
 * Note: ethers is not included by default to keep the package size small.
 * It's only needed for this example script.
 */

import { AuthChain, AuthLinkType, EntityType } from '@dcl/schemas'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { ContentClient, createContentClient } from '../src/client/ContentClient'
import { buildEntity } from '../src/client/utils/DeploymentBuilder'
// @ts-ignore - ethers is an optional dependency for this example
import { Wallet } from 'ethers'

// Configuration
const CATALYST_URL = 'https://peer-testing-2.decentraland.org/content'
// const CATALYST_URL = 'http://localhost:6969'

// Option 1: Generate a random wallet (for testing)
const USE_RANDOM_WALLET = true

// Option 2: Use your own private key (for production)
// Set USE_RANDOM_WALLET to false and provide your private key
const PRIVATE_KEY = process.env.PRIVATE_KEY || '1964b667cb02bf85d20a58b1eda1cd572ca59a5aed7f1798854cba4ea41bd3d5'

// Profile to copy - set to an ethereum address that has a profile deployed
// Leave empty to create a new profile from scratch
const PROFILE_TO_COPY = process.env.PROFILE_TO_COPY || '0xedae96f7739af8a7fb16e2a888c1e578e1328299' // Example: '0x1234...5678'

async function deployProfile() {
  console.log('🚀 Starting profile deployment...\n')

  if (!PROFILE_TO_COPY) {
    console.error('❌ PROFILE_TO_COPY is not set')
    process.exit(1)
  }

  // Step 1: Create or load wallet
  console.log('🔑 Setting up wallet...')
  const wallet = new Wallet(PRIVATE_KEY)

  const ethAddress = wallet.address
  const profilePointer = ethAddress.toLowerCase()

  console.log(`✅ Wallet address: ${ethAddress}`)
  if (USE_RANDOM_WALLET) {
    console.log(`⚠️  Using randomly generated wallet for testing`)
    console.log(`   Private key: ${wallet.privateKey}`)
  }
  console.log()

  // Step 2: Create the fetcher and ContentClient
  console.log('📡 Creating ContentClient...')
  const fetcher = createFetchComponent()
  const contentClient = createContentClient({
    url: CATALYST_URL,
    fetcher
  })
  console.log(`✅ Connected to: ${CATALYST_URL}\n`)

  // Step 3: Prepare profile metadata and files
  let profileMetadata: any
  let files: Map<string, Uint8Array>

  // Download existing profile
  console.log(`📥 Downloading profile from: ${PROFILE_TO_COPY}...\n`)
  const downloadedProfile = await downloadProfile(contentClient, PROFILE_TO_COPY)
  profileMetadata = downloadedProfile.metadata
  files = downloadedProfile.files

  console.log(`✅ Downloaded profile: ${profileMetadata.avatars[0].name}`)
  console.log(`✅ Downloaded ${files.size} files\n`)

  // Update the profile to use the new wallet's address
  console.log('🔄 Updating profile to new wallet address...')
  profileMetadata.avatars[0].userId = ethAddress.toLowerCase()
  profileMetadata.avatars[0].ethAddress = ethAddress
  // Remove the snapshots from the avatar
  delete profileMetadata.avatars[0].avatar['snapshots']

  console.log(`✅ Profile updated for new address\n`)

  // Step 4: Build the deployment
  console.log('🔨 Building deployment entity...')
  const deploymentPreparation = await buildEntity({
    type: EntityType.PROFILE,
    pointers: [profilePointer],
    // Do not include the files in the deployment
    // files: files,
    metadata: profileMetadata,
    timestamp: Date.now()
  })

  console.log('Deployment preparation:', deploymentPreparation)
  const decoder = new TextDecoder('utf-8')
  console.log(
    'Deployment preparation files:',
    decoder.decode(deploymentPreparation.files.get(deploymentPreparation.entityId))
  )

  console.log(`✅ Entity ID: ${deploymentPreparation.entityId}`)
  console.log(`✅ Total files in deployment: ${deploymentPreparation.files.size}\n`)

  // Step 5: Create auth chain (sign the deployment)
  console.log('🔐 Creating authentication chain...')
  const authChain = await createAuthChain(wallet, deploymentPreparation.entityId)
  console.log('✅ Auth chain created with real wallet signature\n')

  // Step 6: Deploy to the content server
  console.log('📤 Deploying profile to content server...')
  try {
    const deploymentData = {
      ...deploymentPreparation,
      authChain
    }

    const response = await contentClient.deploy(deploymentData)
    console.log('✅ Profile deployed successfully!')
    console.log(`📝 Deployment response:`, response)

    if (PROFILE_TO_COPY) {
      console.log(`\n🎉 Profile copied from ${PROFILE_TO_COPY} and redeployed!`)
    } else {
      console.log(`\n🎉 New profile created!`)
    }
    console.log(`   View at: ${CATALYST_URL}/entities/profile?pointer=${profilePointer}`)
  } catch (error) {
    console.error('❌ Deployment failed:', error)
    throw error
  }
}

/**
 * Downloads an existing profile from the content server
 * @param contentClient - The ContentClient instance
 * @param ethereumAddress - The ethereum address of the profile to download
 * @returns The profile metadata and files
 */
async function downloadProfile(
  contentClient: ContentClient,
  ethereumAddress: string
): Promise<{ metadata: any; files: Map<string, Uint8Array> }> {
  // Fetch the entity by pointer (ethereum address)
  const pointer = ethereumAddress.toLowerCase()
  console.log(`   Fetching entity for pointer: ${pointer}`)

  const entities = await contentClient.fetchEntitiesByPointers([pointer])

  if (entities.length === 0) {
    throw new Error(`No profile found for address: ${ethereumAddress}`)
  }

  const entity = entities[0]
  console.log(`   ✓ Found entity: ${entity.id}`)
  console.log(`   ✓ Entity type: ${entity.type}`)
  console.log(`   ✓ Content files: ${entity.content?.length || 0}`)

  // Download all content files
  const files = new Map<string, Uint8Array>()

  if (entity.content && entity.content.length > 0) {
    console.log(`   Downloading content files...`)

    for (const contentFile of entity.content) {
      console.log(`   ↓ Downloading: ${contentFile.file} (${contentFile.hash})`)
      try {
        const fileContent = await contentClient.downloadContent(contentFile.hash)
        files.set(contentFile.file, fileContent)
        console.log(`   ✓ Downloaded: ${contentFile.file} (${fileContent.length} bytes)`)
      } catch (error) {
        console.error(`   ✗ Failed to download ${contentFile.file}:`, error)
        throw error
      }
    }
  }

  return {
    metadata: entity.metadata,
    files
  }
}

/**
 * Prepares profile files (avatar snapshots)
 * In a real scenario, you would load actual PNG files
 */
async function prepareProfileFiles(): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()

  // Option 1: Load from actual files (uncomment if you have image files)
  /*
  const face256Path = path.join(__dirname, 'assets', 'face256.png')
  const bodyPath = path.join(__dirname, 'assets', 'body.png')

  if (fs.existsSync(face256Path)) {
    files.set('face256.png', fs.readFileSync(face256Path))
  }

  if (fs.existsSync(bodyPath)) {
    files.set('body.png', fs.readFileSync(bodyPath))
  }
  */

  // Option 2: Create dummy files for testing (current implementation)
  // In production, replace these with actual avatar snapshot images
  const dummyFace = Buffer.from('dummy-face256-png-content')
  const dummyBody = Buffer.from('dummy-body-png-content')

  files.set('face256.png', dummyFace)
  files.set('body.png', dummyBody)

  return files
}

/**
 * Creates an authentication chain for the deployment using ethers Wallet
 *
 * The auth chain proves ownership of the Ethereum address by signing the entity ID
 *
 * @param wallet - The ethers Wallet instance to sign with
 * @param entityId - The entity ID to sign (returned from buildEntity)
 * @returns AuthChain that can be used for deployment
 */
async function createAuthChain(wallet: Wallet, entityId: string): Promise<AuthChain> {
  // Sign the entity ID with the wallet
  // This creates a signature that proves the wallet owner approves this deployment
  const signature = await wallet.signMessage(entityId)

  // Build the auth chain
  // The auth chain is an array that traces the authorization from the address to the signature
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

// Run the deployment
if (require.main === module) {
  deployProfile()
    .then(() => {
      console.log('\n✨ Script completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error)
      process.exit(1)
    })
}

export { createAuthChain, deployProfile, downloadProfile, prepareProfileFiles }
