import { hashV1 } from '@dcl/hashing'
import { Avatar } from '@dcl/schemas'
import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
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
    const fileHash = await hashV1(fileContent)
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
    expect(entityId).toEqual(await hashV1(entityFileBuffer))

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

describe('EntityFactory', () => {
  it('When an entity is built with no pointers, then an exception is thrown', async () => {
    await expect(
      DeploymentBuilder.buildEntityAndFile({
        version: EntityVersion.V3,
        type: EntityType.PROFILE,
        pointers: [],
        timestamp: 20
      })
    ).rejects.toThrow(`All entities must have at least one pointer.`)
  })

  it('When a v2 entity is built, then an exception is thrown', async () => {
    await expect(
      DeploymentBuilder.buildEntityAndFile({
        version: EntityVersion.V2,
        type: EntityType.PROFILE,
        pointers: ['P1'],
        timestamp: 20
      })
    ).rejects.toThrow(`V2 is not supported.`)
  })

  it('When a v3 entity is built, CIDv1 is used', async () => {
    const { entity, entityFile } = await DeploymentBuilder.buildEntityAndFile({
      version: EntityVersion.V3,
      type: EntityType.PROFILE,
      pointers: ['P1'],
      timestamp: 20
    })

    expect(entity.id).toEqual(await hashV1(entityFile))
    expect(entity.id).toEqual('bafkreic7lioyaaith5fyrwptvobgbadbsvyo6vatnhvoxtwqwlzxrtsn3y')
  })

  it('Fails on filesystem name collision', async () => {
    let didFail: any = null
    try {
      await DeploymentBuilder.buildEntityAndFile({
        version: EntityVersion.V3,
        type: EntityType.PROFILE,
        pointers: ['P1'],
        timestamp: 20,
        content: [
          { file: 'A', hash: '' },
          { file: 'a', hash: '' }
        ]
      })
    } catch (err: any) {
      didFail = err
    }

    expect(didFail).not.toEqual(null)
    expect(didFail.toString()).toContain('Decentraland\'s file system is case insensitive, the file "a" is repeated')
  })

  it('Does not fail on correct filesystem', async () => {
    await DeploymentBuilder.buildEntityAndFile({
      version: EntityVersion.V3,
      type: EntityType.PROFILE,
      pointers: ['P1'],
      timestamp: 20,
      content: [
        { file: 'a', hash: '' },
        { file: 'b', hash: '' }
      ]
    })
  })

  it('When an entity without version, CIDv1 is used and default version is v3', async () => {
    const { entity, entityFile } = await DeploymentBuilder.buildEntityAndFile({
      type: EntityType.PROFILE,
      pointers: ['P1'],
      timestamp: 20
    })

    expect(entity.version).toEqual(EntityVersion.V3)
    expect(entity.id).toEqual(await hashV1(entityFile))
    expect(entity.id).toEqual('bafkreic7lioyaaith5fyrwptvobgbadbsvyo6vatnhvoxtwqwlzxrtsn3y')
  })

  it('When a v4 entity is built, the ipfs hash is used', async () => {
    const avatarInfo = {
      bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
      snapshots: {
        face256: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s',
        body: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      },
      eyes: { color: { r: 0.23046875, g: 0.625, b: 0.3125 } },
      hair: { color: { r: 0.35546875, g: 0.19140625, b: 0.05859375 } },
      skin: { color: { r: 0.94921875, g: 0.76171875, b: 0.6484375 } },
      wearables: ['urn:decentraland:off-chain:base-avatars:tall_front_01']
    }

    const avatar: Avatar = {
      userId: '0x87956abc4078a0cc3b89b419628b857b8af826ed',
      email: 'some@email.com',
      name: 'Some Name',
      hasClaimedName: true,
      description: 'Some Description',
      ethAddress: '0x87956abC4078a0Cc3b89b419628b857B8AF826Ed',
      version: 44,
      avatar: avatarInfo,
      tutorialStep: 355,
      interests: []
    }

    const { entity, entityFile } = await DeploymentBuilder.buildEntityAndFile({
      version: EntityVersion.V4,
      type: EntityType.PROFILE,
      pointers: ['P1'],
      timestamp: 20,
      metadata: {
        avatars: [avatar]
      }
    })

    expect(entity.id).toEqual(await hashV1(entityFile))
    expect(entity.id).toEqual('bafkreiawpk2gvgkxgvqwh5vwzh4yibcou5rfg3ddem3e4jl4mkgftq5ava')
  })
})
