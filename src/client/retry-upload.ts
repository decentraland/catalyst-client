import { FileUploadOutcome } from './deploy-v2'

export type RetryConfig = {
  retries: number       // additional attempts after the first
  baseDelayMs: number
}

export async function retryUpload(
  op: () => Promise<FileUploadOutcome>,
  config: RetryConfig
): Promise<FileUploadOutcome> {
  let last: FileUploadOutcome
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    last = await op()
    if (last.kind !== 'retryable') return last
    if (attempt < config.retries && config.baseDelayMs > 0) {
      const delay = config.baseDelayMs * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  return last!
}
