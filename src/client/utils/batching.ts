/**
 * Default cap on the summed file bytes per partial-deployment request. The infrastructure in front of
 * the content servers times out requests larger than ~200MB, so 100MB keeps a comfortable safety
 * margin (the cap counts file bytes, not exact wire size — the margin also absorbs multipart overhead
 * and the entity JSON riding along in the first request) while keeping the request count low for large
 * scenes. Also under the servers' own request caps (worlds-content-server 350MB, catalyst 2GiB).
 */
export const DEFAULT_MAX_BATCH_SIZE_BYTES = 100 * 1024 * 1024 // 100 MiB

export type FileBatch = {
  hashes: string[]
  sizeBytes: number
}

/**
 * Splits files into batches whose summed byte size stays at or below `maxBatchSizeBytes`, using
 * first-fit-decreasing bin packing. A single file larger than the cap gets its own batch — files are
 * never split across requests, so such a request exceeds the cap and may hit the servers' per-file
 * limits or the ~200MB infrastructure timeout. Deterministic given the same input.
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
