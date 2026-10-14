import { FetchResponse } from '../types'

/**
 * Reads a fetch response as JSON while ALWAYS releasing the underlying body.
 *
 * With the native (undici) `fetch`, the keep-alive socket backing a response stays pinned until
 * the body is read or cancelled — so discarding a response without consuming its body leaks the
 * connection (and buffers received bytes) until GC. On a non-ok response this drains the body via
 * `text()` and throws an error including the status and body; on ok it parses and returns the JSON
 * (which consumes the body).
 */
export async function readJsonOrThrow<T>(response: FetchResponse): Promise<T> {
  if (!response.ok) {
    // Reading the body releases the socket and makes the thrown error useful. Guarded so a
    // non-conforming fetcher (a Response without text()) still yields a clean status error
    // rather than a "text is not a function" TypeError.
    const body = typeof response.text === 'function' ? await response.text().catch(() => '') : ''
    throw new Error(`Catalyst responded with status ${response.status}${body ? `: ${body}` : ''}`)
  }

  return (await response.json()) as T
}
