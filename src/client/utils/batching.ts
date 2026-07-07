/**
 * Default cap on the summed file bytes per partial-deployment request. Well under the servers' request
 * caps (worlds-content-server 350MB, catalyst 2GiB) and under typical proxy body limits (~100MB), and
 * small enough that a failed request only re-uploads at most this much. The cap counts file bytes, not
 * exact wire size; the margin absorbs multipart overhead.
 */
export const DEFAULT_MAX_BATCH_SIZE_BYTES = 50 * 1024 * 1024 // 50 MiB

export type FileBatch = {
  hashes: string[]
  sizeBytes: number
}

/**
 * Splits files into batches whose summed byte size stays at or below `maxBatchSizeBytes`, using
 * first-fit-decreasing bin packing. A single file larger than the cap gets its own batch (the servers'
 * per-file caps still apply and would reject it — that is the caller's/server's concern, not this
 * function's). Deterministic given the same input.
 */
export function splitIntoBatches(files: Map<string, Uint8Array>, maxBatchSizeBytes: number): FileBatch[] {
  const entries = Array.from(files.entries()).sort((a, b) => b[1].byteLength - a[1].byteLength)
  const batches: FileBatch[] = []

  for (const [hash, content] of entries) {
    const size = content.byteLength
    let placed = false
    for (const batch of batches) {
      if (batch.sizeBytes + size <= maxBatchSizeBytes) {
        batch.hashes.push(hash)
        batch.sizeBytes += size
        placed = true
        break
      }
    }
    if (!placed) {
      batches.push({ hashes: [hash], sizeBytes: size })
    }
  }

  return batches
}
