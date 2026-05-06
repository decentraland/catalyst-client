import { AuthLinkType } from '@dcl/schemas'
import { deployV2 } from '../../src/client/deploy-v2'

function makeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('deployV2 orchestrator', () => {
  const entityId = 'QmEntity'
  const entityFile = Buffer.from('{}')
  const authChain = [{ type: AuthLinkType.SIGNER, payload: '0x', signature: '' }]

  it('runs init -> upload (parallel) -> finalize, returns finalize Response', async () => {
    let callCount = 0
    const finalizeResponse = { ok: true, status: 200, json: async () => ({ creationTimestamp: 1 }) }
    const fetch = jest.fn().mockImplementation(async (url, opts) => {
      callCount++
      if (url === 'https://example.com/entities' && opts?.method === 'POST' && opts.headers?.['Upload-Incomplete'] === '?1') {
        return {
          ok: true, status: 202,
          json: async () => ({
            availableFiles: [],
            missingFiles: ['QmA', 'QmB', 'QmC'],
            deploymentToken: 'tok',
            expiresAt: Date.now() + 60_000
          })
        }
      }
      if (url.includes('/files/')) {
        return { ok: true, status: 204 }
      }
      if (url === 'https://example.com/entities/QmEntity') {
        return finalizeResponse
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const files = new Map<string, Uint8Array>([
      [entityId, entityFile],
      ['QmA', new Uint8Array([1])],
      ['QmB', new Uint8Array([2])],
      ['QmC', new Uint8Array([3])]
    ])

    const result = await deployV2(
      'https://example.com',
      { entityId, files, authChain },
      { parallelism: 2 },
      makeFetcher(fetch)
    )

    expect(result).toBe(finalizeResponse)
    const fileCalls = fetch.mock.calls.filter((c) => c[0].includes('/files/'))
    expect(fileCalls).toHaveLength(3)
    expect(fileCalls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        'https://example.com/entities/QmEntity/files/QmA',
        'https://example.com/entities/QmEntity/files/QmB',
        'https://example.com/entities/QmEntity/files/QmC'
      ])
    )
  })

  it('skips already-available files', async () => {
    const fetch = jest.fn().mockImplementation(async (url, opts) => {
      if (url === 'https://example.com/entities' && opts?.headers?.['Upload-Incomplete'] === '?1') {
        return {
          ok: true, status: 202,
          json: async () => ({
            availableFiles: ['QmA'], // already there
            missingFiles: ['QmB'],
            deploymentToken: 'tok',
            expiresAt: Date.now() + 60_000
          })
        }
      }
      if (url.includes('/files/')) return { ok: true, status: 204 }
      if (url === 'https://example.com/entities/QmEntity') {
        return { ok: true, status: 200, json: async () => ({}) }
      }
      throw new Error(`Unexpected: ${url}`)
    })
    const files = new Map<string, Uint8Array>([
      [entityId, entityFile],
      ['QmA', new Uint8Array([1])],
      ['QmB', new Uint8Array([2])]
    ])

    await deployV2(
      'https://example.com',
      { entityId, files, authChain },
      {},
      makeFetcher(fetch)
    )

    const fileCalls = fetch.mock.calls.filter((c) => c[0].includes('/files/'))
    expect(fileCalls).toHaveLength(1)
    expect(fileCalls[0][0]).toContain('/files/QmB')
  })

  it('emits progress callbacks', async () => {
    const fetch = jest.fn().mockImplementation(async (url, opts) => {
      if (opts?.headers?.['Upload-Incomplete'] === '?1') {
        return {
          ok: true, status: 202,
          json: async () => ({
            availableFiles: [],
            missingFiles: ['QmA', 'QmB'],
            deploymentToken: 'tok',
            expiresAt: Date.now() + 60_000
          })
        }
      }
      if (url.includes('/files/')) return { ok: true, status: 204 }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    const files = new Map<string, Uint8Array>([
      [entityId, entityFile],
      ['QmA', new Uint8Array([1, 2, 3])],
      ['QmB', new Uint8Array([4, 5])]
    ])
    const onProgress = jest.fn()

    await deployV2(
      'https://example.com',
      { entityId, files, authChain },
      { parallelism: 1, onProgress },
      makeFetcher(fetch)
    )

    expect(onProgress).toHaveBeenCalled()
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
    expect(last.uploaded).toBe(2)
    expect(last.total).toBe(2)
    expect(last.bytesUploaded).toBe(5)
    expect(last.bytesTotal).toBe(5)
  })
})

describe('deployV2 — eviction recovery', () => {
  const entityId = 'QmEntity'
  const entityFile = Buffer.from('{}')
  const authChain = [{ type: AuthLinkType.SIGNER, payload: '0x', signature: '' }]

  it('reinits on 404 mid-upload then completes', async () => {
    let initCalls = 0
    const fetch = jest.fn().mockImplementation(async (url, opts) => {
      if (opts?.headers?.['Upload-Incomplete'] === '?1') {
        initCalls++
        return {
          ok: true, status: 202,
          json: async () => ({
            availableFiles: [],
            missingFiles: ['QmA', 'QmB'],
            deploymentToken: `tok-${initCalls}`,
            expiresAt: Date.now() + 60_000
          })
        }
      }
      if (url.includes('/files/')) {
        if (initCalls === 1) {
          // first round: simulate eviction
          return { ok: false, status: 404 }
        }
        return { ok: true, status: 204 }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    const files = new Map<string, Uint8Array>([
      [entityId, entityFile],
      ['QmA', new Uint8Array([1])],
      ['QmB', new Uint8Array([2])]
    ])

    await deployV2(
      'https://example.com',
      { entityId, files, authChain },
      { parallelism: 1, retries: 0 },
      { fetch } as any
    )

    expect(initCalls).toBe(2)
  })

  it('throws when resumeOnEviction=false', async () => {
    const fetch = jest.fn().mockImplementation(async (url, opts) => {
      if (opts?.headers?.['Upload-Incomplete'] === '?1') {
        return {
          ok: true, status: 202,
          json: async () => ({
            availableFiles: [], missingFiles: ['QmA'],
            deploymentToken: 'tok', expiresAt: Date.now() + 60_000
          })
        }
      }
      if (url.includes('/files/')) return { ok: false, status: 404 }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    const files = new Map<string, Uint8Array>([
      [entityId, entityFile],
      ['QmA', new Uint8Array([1])]
    ])

    await expect(
      deployV2(
        'https://example.com',
        { entityId, files, authChain },
        { parallelism: 1, retries: 0, resumeOnEviction: false },
        { fetch } as any
      )
    ).rejects.toThrow(/evicted/)
  })
})
