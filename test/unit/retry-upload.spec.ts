import { retryUpload } from '../../src/client/retry-upload'
import { FileUploadOutcome } from '../../src/client/deploy-v2'

const okOutcome: FileUploadOutcome = { kind: 'ok' }
const retryable: FileUploadOutcome = { kind: 'retryable', cause: new Error('boom') }

describe('retryUpload', () => {
  it('returns the outcome on first success', async () => {
    const op = jest.fn().mockResolvedValueOnce(okOutcome)
    const result = await retryUpload(op, { retries: 3, baseDelayMs: 0 })
    expect(result).toBe(okOutcome)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable then succeeds', async () => {
    const op = jest
      .fn()
      .mockResolvedValueOnce(retryable)
      .mockResolvedValueOnce(retryable)
      .mockResolvedValueOnce(okOutcome)
    const result = await retryUpload(op, { retries: 3, baseDelayMs: 0 })
    expect(result).toBe(okOutcome)
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('returns last retryable when retries exhausted', async () => {
    const op = jest.fn().mockResolvedValue(retryable)
    const result = await retryUpload(op, { retries: 2, baseDelayMs: 0 })
    expect(result.kind).toBe('retryable')
    expect(op).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('does NOT retry fatal outcomes', async () => {
    const fatal: FileUploadOutcome = { kind: 'fatal', error: new Error('x') as any }
    const op = jest.fn().mockResolvedValue(fatal)
    const result = await retryUpload(op, { retries: 3, baseDelayMs: 0 })
    expect(result).toBe(fatal)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry evicted outcomes', async () => {
    const evicted: FileUploadOutcome = { kind: 'evicted' }
    const op = jest.fn().mockResolvedValue(evicted)
    const result = await retryUpload(op, { retries: 3, baseDelayMs: 0 })
    expect(result).toBe(evicted)
    expect(op).toHaveBeenCalledTimes(1)
  })
})
