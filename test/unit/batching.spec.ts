import { DEFAULT_MAX_BATCH_SIZE_BYTES, splitIntoBatches } from '../../src/client/utils/batching'

describe('splitIntoBatches', () => {
  function file(bytes: number): Uint8Array {
    return new Uint8Array(bytes)
  }

  describe('when all files fit under the cap', () => {
    it('should return a single batch with every hash', () => {
      const files = new Map<string, Uint8Array>([
        ['a', file(10)],
        ['b', file(20)],
        ['c', file(30)]
      ])

      const batches = splitIntoBatches(files, 1000)

      expect(batches).toHaveLength(1)
      expect(new Set(batches[0].hashes)).toEqual(new Set(['a', 'b', 'c']))
      expect(batches[0].sizeBytes).toBe(60)
    })
  })

  describe('when the files exceed the cap', () => {
    it('should split into batches each at or below the cap', () => {
      const files = new Map<string, Uint8Array>([
        ['a', file(60)],
        ['b', file(50)],
        ['c', file(40)],
        ['d', file(30)]
      ])

      const batches = splitIntoBatches(files, 100)

      for (const batch of batches) {
        expect(batch.sizeBytes).toBeLessThanOrEqual(100)
      }
      const allHashes = batches.flatMap((b) => b.hashes)
      expect(new Set(allHashes)).toEqual(new Set(['a', 'b', 'c', 'd']))
      expect(allHashes).toHaveLength(4)
    })
  })

  describe('when a single file is larger than the cap', () => {
    it('should place it alone in its own batch', () => {
      const files = new Map<string, Uint8Array>([
        ['big', file(500)],
        ['small', file(10)]
      ])

      const batches = splitIntoBatches(files, 100)

      const bigBatch = batches.find((b) => b.hashes.includes('big'))
      expect(bigBatch).toBeDefined()
      expect(bigBatch!.hashes).toEqual(['big'])
    })
  })

  describe('when the files map is empty', () => {
    it('should return no batches', () => {
      expect(splitIntoBatches(new Map(), 100)).toEqual([])
    })
  })

  describe('when using the default cap', () => {
    it('should be 50 MiB', () => {
      expect(DEFAULT_MAX_BATCH_SIZE_BYTES).toBe(50 * 1024 * 1024)
    })
  })
})
