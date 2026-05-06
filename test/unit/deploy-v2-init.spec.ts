import { AuthLinkType } from '@dcl/schemas'
import { initDeployment } from '../../src/client/deploy-v2'
import { DeploymentInitError } from '../../src/client/errors'

function makeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('initDeployment', () => {
  const entityId = 'QmEntity'
  const entityFile = Buffer.from('{"content":[{"file":"a.glb","hash":"QmA"}]}')
  const authChain = [{ type: AuthLinkType.SIGNER, payload: '0xabc', signature: '' }]
  const files = new Map<string, Uint8Array>([
    [entityId, entityFile],
    ['QmA', new Uint8Array([1, 2, 3])]
  ])

  it('POSTs to /entities with Upload-Incomplete header', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        availableFiles: [],
        missingFiles: ['QmA'],
        deploymentToken: 'tok-1',
        expiresAt: Date.now() + 60_000
      })
    })

    const result = await initDeployment('https://example.com', { entityId, files, authChain }, makeFetcher(fetch))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://example.com/entities')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Upload-Incomplete']).toBe('?1')
    expect(result.missingFiles).toEqual(['QmA'])
    expect(result.deploymentToken).toBe('tok-1')
  })

  it('throws DeploymentInitError on non-2xx', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'invalid manifest'
    })
    await expect(
      initDeployment('https://example.com', { entityId, files, authChain }, makeFetcher(fetch))
    ).rejects.toBeInstanceOf(DeploymentInitError)
  })

  it('throws DeploymentInitError when network fails', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('econnrefused'))
    await expect(
      initDeployment('https://example.com', { entityId, files, authChain }, makeFetcher(fetch))
    ).rejects.toBeInstanceOf(DeploymentInitError)
  })
})
