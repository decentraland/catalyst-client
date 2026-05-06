import { DeploymentInitError, FileUploadError, FinalizeError, ProtocolUnsupportedError } from '../../src/client/errors'

describe('typed errors', () => {
  it('DeploymentInitError has the right name and carries cause', () => {
    const cause = new Error('http 503')
    const e = new DeploymentInitError('init failed', { cause })
    expect(e.name).toBe('DeploymentInitError')
    expect(e instanceof DeploymentInitError).toBe(true)
    expect(e instanceof Error).toBe(true)
    expect((e as any).cause).toBe(cause)
  })

  it('FileUploadError carries fileHash + httpStatus', () => {
    const e = new FileUploadError('upload failed', { fileHash: 'QmABC', httpStatus: 422 })
    expect(e.name).toBe('FileUploadError')
    expect(e.fileHash).toBe('QmABC')
    expect(e.httpStatus).toBe(422)
  })

  it('FinalizeError carries httpStatus and body', () => {
    const e = new FinalizeError('validation failed', { httpStatus: 400, responseBody: { errors: ['x'] } })
    expect(e.name).toBe('FinalizeError')
    expect(e.httpStatus).toBe(400)
    expect(e.responseBody).toEqual({ errors: ['x'] })
  })

  it('ProtocolUnsupportedError marks v2-forced-on-legacy clearly', () => {
    const e = new ProtocolUnsupportedError('https://example.com')
    expect(e.name).toBe('ProtocolUnsupportedError')
    expect(e.message).toContain('https://example.com')
    expect(e.serverUrl).toBe('https://example.com')
  })
})
