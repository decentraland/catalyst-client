import { finalizeDeployment } from '../../src/client/deploy-v2'
import { FinalizeError } from '../../src/client/errors'

function makeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('finalizeDeployment', () => {
  it('POSTs to /entities/:id with token, returns Response on 200', async () => {
    const response = { ok: true, status: 200, json: async () => ({ creationTimestamp: 1 }) }
    const fetch = jest.fn().mockResolvedValue(response)
    const result = await finalizeDeployment('https://example.com', 'QmE', 'tok', makeFetcher(fetch))
    expect(result).toBe(response)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://example.com/entities/QmE')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-Deployment-Token']).toBe('tok')
    expect(opts.body).toBeUndefined()
  })

  it('throws FinalizeError with httpStatus + body on 4xx', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ errors: ['validation failed'] }),
      text: async () => '{"errors":["validation failed"]}',
      clone: function () { return this }
    })
    await expect(
      finalizeDeployment('https://example.com', 'QmE', 'tok', makeFetcher(fetch))
    ).rejects.toMatchObject({
      name: 'FinalizeError',
      httpStatus: 400
    })
  })

  it('throws FinalizeError on network failure', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(
      finalizeDeployment('https://example.com', 'QmE', 'tok', makeFetcher(fetch))
    ).rejects.toBeInstanceOf(FinalizeError)
  })
})
