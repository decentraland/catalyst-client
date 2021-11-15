import { EntityType, EntityVersion, Hashing } from 'dcl-catalyst-commons'
import { DeploymentBuilder } from '../../src/utils/DeploymentBuilder'

describe('Deployment Builder', () => {
  it('When an entity is built with no pointers, then an exception is thrown', async () => {
    await expect(
      DeploymentBuilder.buildEntity({ version: EntityVersion.V3, type: EntityType.PROFILE, pointers: [] })
    ).rejects.toEqual(new Error('All entities must have at least one pointer.'))
  })

  it('When an entity is built, then the result is the expected', async () => {
    // Prepare some data
    const someMetadata = { property: 'value' }
    const pointer = 'pointer'

    // Build content file
    const fileContent = Buffer.from('content')
    const fileHash = await Hashing.calculateBufferHash(fileContent)
    const fileId = 'Id'
    const contentFiles = new Map([[fileId, fileContent]])
    const date = 100

    const { entityId, files } = await DeploymentBuilder.buildEntity({
      version: EntityVersion.V3,
      type: EntityType.PROFILE,
      pointers: [pointer],
      files: contentFiles,
      metadata: someMetadata,
      timestamp: date
    })

    // Assertions
    expect(files.size).toEqual(2)

    // Assert content file name and buffer
    const contentFileBuffer = files.get(fileHash)!
    expect(contentFileBuffer).toEqual(fileContent)

    // Assert entity id and entity file name
    const entityFileBuffer = files.get(entityId)!
    expect(entityId).toEqual(await Hashing.calculateBufferHash(entityFileBuffer))

    // Assert entity file
    const { type, pointers, timestamp, content, metadata } = JSON.parse(
      new TextDecoder().decode(entityFileBuffer).toString()
    )

    expect(type).toEqual(EntityType.PROFILE)
    expect(pointers).toEqual([pointer])
    expect(content).toEqual([{ file: fileId, hash: fileHash }])
    expect(metadata).toEqual(someMetadata)
    expect(timestamp).toEqual(date)
  })
})
