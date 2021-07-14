import { HealthStatus } from 'dcl-catalyst-commons'
import { CatalystClient } from '../../src/CatalystClient'
import { clientConnectedToCatalystIn } from '../../src/utils/CatalystClientBuilder'
import * as catalystList from '../../src/utils/catalystList'
import * as common from '../../src/utils/common'

const server1 = 'server1'
const healthyServer = 'server2'
const server3 = 'server3'

const mockedServerList = [server1, healthyServer, server3]
jest.mock('../../src/CatalystClient', () => ({
  CatalystClient: jest.fn().mockImplementation((url) => {
    return {
      fetchPeerHealth: jest.fn().mockImplementation(() => {
        if (url === server1) {
          return {
            comms: HealthStatus.UNHEALTHY,
            lambdas: HealthStatus.HEALTHY,
            content: HealthStatus.DOWN
          }
        }

        return {
          comms: HealthStatus.HEALTHY,
          lambdas: HealthStatus.HEALTHY,
          content: HealthStatus.HEALTHY
        }
      })
    }
  })
}))

describe('clientConnectedToCatalystIn', () => {
  let getUpdatedApprovedListWithoutQueryingContractSpy: jest.SpyInstance
  let getApprovedListFromContractSpy: jest.SpyInstance
  let shuffleArraySpy: jest.SpyInstance

  describe('when the noContractList is empty', () => {
    beforeEach(() => {
      getUpdatedApprovedListWithoutQueryingContractSpy = jest.spyOn(
        catalystList,
        'getUpdatedApprovedListWithoutQueryingContract'
      )
      getApprovedListFromContractSpy = jest.spyOn(catalystList, 'getApprovedListFromContract')
      shuffleArraySpy = jest.spyOn(common, 'shuffleArray').mockReturnValueOnce(mockedServerList)
      getUpdatedApprovedListWithoutQueryingContractSpy.mockReturnValueOnce(Promise.resolve(undefined))
      getApprovedListFromContractSpy.mockReturnValue(Promise.resolve(mockedServerList))
    })

    afterEach(() => {
      getUpdatedApprovedListWithoutQueryingContractSpy.mockRestore()
      getApprovedListFromContractSpy.mockRestore()
      shuffleArraySpy.mockClear()
      shuffleArraySpy.mockRestore()
    })

    it('should use get the approved list from the DAO', async () => {
      await clientConnectedToCatalystIn({ network: 'mainnet', origin: '' })
      expect(shuffleArraySpy).toHaveBeenCalledTimes(1)
      expect(shuffleArraySpy).toHaveBeenCalledWith(mockedServerList)
    })
  })

  describe('when the noContractList is not empty', () => {
    let result: CatalystClient

    beforeEach(async () => {
      getUpdatedApprovedListWithoutQueryingContractSpy = jest.spyOn(
        catalystList,
        'getUpdatedApprovedListWithoutQueryingContract'
      )
      getApprovedListFromContractSpy = jest.spyOn(catalystList, 'getApprovedListFromContract')
      shuffleArraySpy = jest.spyOn(common, 'shuffleArray').mockReturnValueOnce(mockedServerList)
      getUpdatedApprovedListWithoutQueryingContractSpy.mockReturnValue(Promise.resolve(mockedServerList))
      getApprovedListFromContractSpy.mockReturnValue(Promise.resolve(undefined))

      result = await clientConnectedToCatalystIn({ network: 'mainnet', origin: '' })
    })

    afterEach(() => {
      getUpdatedApprovedListWithoutQueryingContractSpy.mockRestore()
      getApprovedListFromContractSpy.mockRestore()
      shuffleArraySpy.mockRestore()
    })

    it('should use noContractList as the list of servers and return a result', () => {
      expect(shuffleArraySpy).toHaveBeenCalledTimes(1)
      expect(shuffleArraySpy).toHaveBeenCalledWith(mockedServerList)
      expect(result).toBeDefined()
    })
  })
})
