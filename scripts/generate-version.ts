import { execSync } from 'child_process'
import fs from 'fs'

async function main(): Promise<void> {
  let version = 'Unkown'
  // Get the latest Git tag
  const latestTag = execSync('git describe --tags --abbrev=0').toString().trim()

  // Get the commit hash associated with the latest tag
  const tagCommitHash = execSync(`git rev-list -n 1 ${latestTag}`).toString().trim()

  // Get the current commit hash
  const currentCommitHash = execSync('git rev-parse HEAD').toString().trim()

  // Check if the current commit hash is equal to the tag commit hash
  if (currentCommitHash !== tagCommitHash) {
    // The current commit hash is not associated with the latest tag, return the commit hash
    console.log(`Current commit hash ${currentCommitHash} is not associated with the latest tag ${latestTag}`)
    console.log(`Returning commit hash ${currentCommitHash}`)
    version = currentCommitHash
  } else {
    // The current commit hash is associated with the latest tag, return the tag
    console.log(`Current commit hash ${currentCommitHash} is associated with the latest tag ${latestTag}`)
    console.log(`Returning tag ${latestTag}`)
    version = latestTag
  }

  const result = `export const CURRENT_VERSION = '${version}'\n`

  await fs.promises.writeFile('src/client/utils/data.ts', Buffer.from(result))
}

main().catch((error) => console.error('Failed to generate lib version', error))
