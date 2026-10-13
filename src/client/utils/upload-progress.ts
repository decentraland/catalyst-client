import { UploadPhase, UploadProgress } from '../types'

// Minimum time between two progress events of the same phase.
export const UPLOAD_PROGRESS_INTERVAL_MS = 200

// Size of each body slice handed to the HTTP client, and so the granularity of the progress.
export const UPLOAD_SLICE_BYTES = 256 * 1024

/** Whether request bodies can be streamed (and so counted as they go out): only on Node. */
export function supportsStreamingUpload(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

/**
 * Whether `error` is the rejection of a fetcher that dropped the `duplex` option of a streamed body.
 * Targets undici's "TypeError: RequestInit: duplex option is required when sending a body."
 */
export function isDuplexUnsupportedError(error: unknown): boolean {
  return error instanceof TypeError && /duplex/i.test(error.message)
}

export type CountingBody = {
  body: ReadableStream<Uint8Array>
  headers: { 'content-type': string; 'content-length': string }
  /** Releases the encoded body and stops the stream if it is still open. */
  dispose: () => void
}

/**
 * Encodes `form` once and returns a stream of it that calls `onStreamed` with the cumulative
 * number of body bytes handed to the HTTP client, one slice at a time.
 */
export async function createCountingBody(
  url: string,
  form: FormData,
  onStreamed: (streamedBytes: number, bodyBytes: number) => void,
  signal?: AbortSignal
): Promise<CountingBody> {
  const encoded = new Request(url, { method: 'POST', body: form })
  const contentType = encoded.headers.get('content-type') ?? 'multipart/form-data'
  let bytes: Uint8Array | undefined = new Uint8Array(await encoded.arrayBuffer())
  const bodyBytes = bytes.byteLength
  let offset = 0
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined

  // Releases the encoded body and, if the stream is still open, errors it so the HTTP client stops reading.
  const stop = (reason?: unknown) => {
    signal?.removeEventListener('abort', onAbort)
    const controller = stream
    bytes = undefined
    stream = undefined
    controller?.error(reason ?? new Error('The upload stopped.'))
  }
  function onAbort() {
    stop(signal?.reason ?? new Error('The upload was aborted.'))
  }

  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        stream = controller
        if (signal?.aborted) onAbort()
        else signal?.addEventListener('abort', onAbort, { once: true })
      },
      pull(controller) {
        if (!bytes) return
        const slice = bytes.subarray(offset, offset + UPLOAD_SLICE_BYTES)
        offset += slice.byteLength
        controller.enqueue(slice)
        if (offset >= bodyBytes) {
          signal?.removeEventListener('abort', onAbort)
          bytes = undefined
          stream = undefined
          controller.close()
        }
        onStreamed(offset, bodyBytes)
      },
      cancel() {
        stream = undefined
        stop()
      }
    },
    // Pull only when the HTTP client reads, so a slice is counted when it is handed over.
    { highWaterMark: 0 }
  )

  return {
    body,
    headers: { 'content-type': contentType, 'content-length': String(bodyBytes) },
    dispose: () => stop()
  }
}

/** Returns `headers` plus `extra`, dropping any caller header that `extra` replaces (case-insensitive). */
export function withBodyHeaders(
  headers: Record<string, string> | undefined,
  extra: Record<string, string>
): Record<string, string> {
  const replaced = new Set(Object.keys(extra).map((name) => name.toLowerCase()))
  const kept = Object.entries(headers ?? {}).filter(([name]) => !replaced.has(name.toLowerCase()))
  return { ...Object.fromEntries(kept), ...extra }
}

/** Progress of one request, in file bytes. */
export type UploadRequestProgress = {
  /** Body bytes streamed so far; converted to file bytes proportionally. */
  streamed(streamedBytes: number, bodyBytes: number): void
  /** The body won't be streamed after all: its bytes count when the response arrives. */
  unstreamed(): void
  /** A response arrived for an unstreamed body: all its file bytes count as sent. */
  delivered(): void
  /** The request ended. Bytes it never sent leave the total only once a retry or success follows. */
  end(): void
}

export type UploadProgressTracker = {
  /** Reports the `/available-content` check, with every candidate file as the provisional total. */
  checking(candidateBytes: number): void
  /** Adds the file bytes a round of requests is about to send, dropping what earlier rounds never sent. */
  plan(fileBytes: number): void
  /** Starts a request carrying `fileBytes` of the planned bytes; `streaming` when its body is counted. */
  request(fileBytes: number, streaming: boolean): UploadRequestProgress
  /** The deployment succeeded: emits `processing` with every byte sent, then stops. */
  complete(): void
  /** The deployment failed: stops without emitting. */
  close(): void
}

/**
 * Runs `upload`, completing the tracker when it succeeds and closing it silently when it rejects or
 * `succeeded` rejects its result (e.g. an error response the caller still receives).
 */
export async function trackUpload<T>(
  tracker: UploadProgressTracker | undefined,
  upload: () => Promise<T>,
  succeeded: (result: T) => boolean = () => true
): Promise<T> {
  try {
    const result = await upload()
    if (succeeded(result)) tracker?.complete()
    else tracker?.close()
    return result
  } catch (error) {
    tracker?.close()
    throw error
  }
}

/** Tracks byte-level upload progress across requests, throttling events to `onUploadProgress`. */
export function createUploadProgressTracker(
  onUploadProgress: (progress: UploadProgress) => void,
  now: () => number = Date.now,
  intervalMs: number = UPLOAD_PROGRESS_INTERVAL_MS
): UploadProgressTracker {
  let phase: UploadPhase | undefined
  let sentBytes = 0
  let totalBytes = 0
  // Planned bytes no request has taken yet, and bytes of ended requests that were never sent.
  let unstartedBytes = 0
  let unsentBytes = 0
  let inFlight = 0
  let lastEmitAt = -Infinity
  let pending = false
  let closed = false
  let trailing: ReturnType<typeof setTimeout> | undefined
  let last: UploadProgress | undefined

  const clearTrailing = () => {
    if (trailing !== undefined) clearTimeout(trailing)
    trailing = undefined
  }

  const emit = () => {
    clearTrailing()
    pending = false
    if (!phase || closed) return
    lastEmitAt = now()
    const progress = { phase, sentBytes: Math.min(sentBytes, totalBytes), totalBytes }
    if (
      last &&
      last.phase === progress.phase &&
      last.sentBytes === progress.sentBytes &&
      last.totalBytes === progress.totalBytes
    ) {
      return
    }
    last = progress
    onUploadProgress(progress)
  }

  const update = () => {
    const elapsed = now() - lastEmitAt
    if (elapsed >= intervalMs) return emit()
    pending = true
    // Trailing edge, so a stalled upload still reports its latest count.
    if (trailing === undefined && !closed) {
      trailing = setTimeout(emit, intervalMs - elapsed)
      ;(trailing as { unref?: () => void }).unref?.()
    }
  }

  const setPhase = (next: UploadPhase) => {
    if (next === phase) return update()
    // The last count of the previous phase goes out before the phase changes.
    if (pending) emit()
    phase = next
    emit()
  }

  // `processing` only once every scheduled byte is sent and responses are pending.
  const refreshPhase = () => {
    if (inFlight === 0) return
    const next = sentBytes >= totalBytes ? 'processing' : 'uploading'
    if (next !== phase) setPhase(next)
  }

  const dropUnsent = () => {
    totalBytes -= unstartedBytes + unsentBytes
    unstartedBytes = 0
    unsentBytes = 0
  }

  return {
    checking(candidateBytes) {
      totalBytes = candidateBytes
      setPhase('checking')
    },
    plan(fileBytes) {
      if (phase === 'checking') totalBytes = 0
      dropUnsent()
      totalBytes += fileBytes
      unstartedBytes += fileBytes
    },
    request(fileBytes, streamingBody) {
      let counted = 0
      let isStreaming = streamingBody
      let ended = false
      unstartedBytes = Math.max(0, unstartedBytes - fileBytes)
      inFlight++
      refreshPhase()

      const count = (bytes: number) => {
        sentBytes += bytes - counted
        counted = bytes
      }

      return {
        streamed(streamedBytes, bodyBytes) {
          if (ended || !isStreaming) return
          const done = streamedBytes >= bodyBytes
          count(done ? fileBytes : Math.floor((fileBytes * streamedBytes) / bodyBytes))
          update()
          refreshPhase()
        },
        unstreamed() {
          if (ended) return
          isStreaming = false
          refreshPhase()
        },
        delivered() {
          if (ended || isStreaming) return
          count(fileBytes)
          update()
          refreshPhase()
        },
        end() {
          if (ended) return
          ended = true
          inFlight--
          unsentBytes += fileBytes - counted
        }
      }
    },
    complete() {
      dropUnsent()
      if (pending) emit()
      phase = 'processing'
      emit()
      closed = true
    },
    close() {
      clearTrailing()
      closed = true
    }
  }
}
