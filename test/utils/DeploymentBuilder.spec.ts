import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { DeploymentBuilder } from '../../src/utils/DeploymentBuilder'
import { EntityType } from '../../src/catalyst-commons/types'
import { Hashing } from '../../src/catalyst-commons/utils/Hashing'
import { ENTITY_FILE_NAME } from '../../src/catalyst-commons/Constants'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('Deployment Builder', () => {

    it('When an entity is built with no pointers, then an exception is thrown', () => {
        expect(DeploymentBuilder.buildEntity(EntityType.PROFILE, [])).to.be.rejectedWith('All entities must have at least one pointer.')
    })

    it('When an entity is built, then the result is the expected', async () => {
        // Prepare some data
        const someMetadata = { property: "value" }
        const pointer = "pointer"

        // Build content file
        const fileContent = Buffer.from("content")
        const fileHash = await Hashing.calculateBufferHash(fileContent)
        const fileId = "Id"
        const contentFiles = new Map([[fileId, fileContent]])

        const { entityId, files } = await DeploymentBuilder.buildEntity(EntityType.PROFILE, [pointer], contentFiles, someMetadata)

        // Assertions
        expect(files.size).to.equal(2)

        // Assert content file name and buffer
        const { name: contentFileName, content: contentFileBuffer } = files.get(fileHash)!!
        expect(contentFileName).to.equal(fileId)
        expect(contentFileBuffer).to.equal(fileContent)

        // Assert entity id and entity file name
        const { name: entityFileName, content: entityFileBuffer } = files.get(entityId)!!
        expect(entityFileName).to.equal(ENTITY_FILE_NAME)
        expect(entityId).to.equal(await Hashing.calculateBufferHash(entityFileBuffer))

        // Assert entity file
        const {
            type,
            pointers,
            timestamp,
            content,
            metadata } = JSON.parse(entityFileBuffer.toString())

         expect(type).to.equal(EntityType.PROFILE)
         expect(pointers).to.deep.equal([pointer])
         expect(content).to.deep.equal([{file: fileId, hash: fileHash}])
         expect(metadata).to.deep.equal(someMetadata)
         expect(timestamp).to.be.closeTo(Date.now(), 100)
    })

})