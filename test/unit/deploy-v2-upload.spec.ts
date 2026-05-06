import { uploadFile, FileUploadOutcome } from '../../src/client/deploy-v2'
import { FileUploadError } from '../../src/client/errors'

function makeFetcher(impl: jest.Mock) {
  return { fetch: impl } as any
}

describe('uploadFile', () => {
  const baseInput = {
    serverUrl: 'https://example.com',
    entityId: 'QmEntity',
    fileHash: 'QmA',
    bytes: new Uint8Array([1, 2, 3]),
    deploymentToken: 'tok'
  }

  it('returns ok on 204', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 })
    const result = await uploadFile(baseInput, makeFetcher(fetch))
    expect(result).toEqual({ kind: 'ok' } as FileUploadOutcome)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://example.com/entities/QmEntity/files/QmA')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-Deployment-Token']).toBe('tok')
    expect(opts.headers['Content-Type']).toBe('application/octet-stream')
  })

  it('returns evicted on 404', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await uploadFile(baseInput, makeFetcher(fetch))
    expect(result).toEqual({ kind: 'evicted' } as FileUploadOutcome)
  })

  it('returns retryable on 503', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 })
    const result = await uploadFile(baseInput, makeFetcher(fetch))
    expect(result.kind).toBe('retryable')
  })

  it('returns retryable on network error', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('econnreset'))
    const result = await uploadFile(baseInput, makeFetcher(fetch))
    expect(result.kind).toBe('retryable')
  })

  it('returns fatal FileUploadError on 422', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false, status: 422, text: async () => 'manifest mismatch'
    })
    const result = await uploadFile(baseInput, makeFetcher(fetch))
    expect(result.kind).toBe('fatal')
    expect((result as any).error).toBeInstanceOf(FileUploadError)
    expect((result as any).error.fileHash).toBe('QmA')
    expect((result as any).error.httpStatus).toBe(422)
  })
})
