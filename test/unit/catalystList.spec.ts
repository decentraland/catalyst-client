import { getUpdatedApprovedListWithoutQueryingContract } from '../../src/utils/catalystList'

describe('Catalyst Client Builder', () => {
  describe('getUpdatedApprovedListWithoutQueryingContract', () => {
    const REQUIRED_LISTS = 2
    const [ADDRESS1, ADDRESS2, ADDRESS3] = ['http://test1.com', 'http://test2.com', 'http://test3.com']

    it('When the amount of known servers on the list is less than required, then no fetching is performed and nothing is returned', async () => {
      let fetchCount = 0

      const result = await calculateList({
        list: [{ address: ADDRESS1 }],
        fetchApprovedCatalysts: () => {
          fetchCount++
          return Promise.resolve([])
        }
      })

      expect(fetchCount).toEqual(0)
      expect(result).toBeUndefined()
    })

    it(`When one of the first N servers doesn't respond, then next one is queried`, async () => {
      let fetchCount = 0

      await calculateList({
        list: [{ address: ADDRESS1 }, { address: ADDRESS2 }, { address: ADDRESS3 }],
        fetchApprovedCatalysts: () => {
          if (fetchCount++ === 0) {
            return Promise.resolve(undefined)
          }
          return Promise.resolve([ADDRESS1])
        }
      })

      expect(fetchCount).toEqual(3)
    })

    it(`When not enough servers responded with a valid list, then nothing is returned`, async () => {
      let fetchCount = 0

      const result = await calculateList({
        list: [{ address: ADDRESS1 }, { address: ADDRESS2 }, { address: ADDRESS3 }],
        fetchApprovedCatalysts: () => {
          fetchCount++
          return Promise.resolve(undefined)
        }
      })

      expect(fetchCount).toEqual(3)
      expect(result).toBeUndefined()
    })

    it(`When the intersection is empty, then nothing is returned`, async () => {
      const result = await calculateList({
        list: [{ address: ADDRESS1 }, { address: ADDRESS2 }, { address: ADDRESS3 }],
        fetchApprovedCatalysts: (catalystUrl) => {
          return Promise.resolve([catalystUrl])
        }
      })

      expect(result).toBeUndefined()
    })

    it(`When there are enough updated lists, then the intersection is returned`, async () => {
      let fetchCount = 0

      const result = await calculateList({
        list: [{ address: ADDRESS1 }, { address: ADDRESS2 }],
        fetchApprovedCatalysts: async () => {
          switch (fetchCount++) {
            case 0:
              return [ADDRESS1, ADDRESS2]
            case 1:
              return [ADDRESS2, ADDRESS3]
          }
          return undefined
        }
      })

      expect(fetchCount).toEqual(2)
      expect(result).toEqual([ADDRESS2])
    })

    function calculateList({
      list,
      fetchApprovedCatalysts
    }: {
      list: { address: string }[]
      fetchApprovedCatalysts: (catalystUrl: string) => Promise<string[] | undefined>
    }) {
      return getUpdatedApprovedListWithoutQueryingContract({
        requiredLists: REQUIRED_LISTS,
        preKnownServers: { list },
        fetchApprovedCatalysts
      })
    }
  })
})
