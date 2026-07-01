import { readJsonOrThrow } from '../../src/client/utils/response'
import { FetchResponse } from '../../src/client/types'

function mockResponse(overrides: { ok: boolean; status: number; json?: jest.Mock; text?: jest.Mock }): FetchResponse {
  return {
    json: overrides.json ?? jest.fn(),
    text: overrides.text ?? jest.fn(),
    arrayBuffer: jest.fn(),
    ok: overrides.ok,
    status: overrides.status
  } as unknown as FetchResponse
}

describe('readJsonOrThrow', () => {
  it('When the response is ok, then it parses and returns the JSON without reading the body as text', async () => {
    const json = jest.fn().mockResolvedValue({ a: 1 })
    const text = jest.fn()

    const result = await readJsonOrThrow<{ a: number }>(mockResponse({ ok: true, status: 200, json, text }))

    expect(result).toEqual({ a: 1 })
    expect(text).not.toHaveBeenCalled()
  })

  it('When the response is not ok, then it drains the body via text() and throws with the status and body', async () => {
    const json = jest.fn()
    const text = jest.fn().mockResolvedValue('upstream boom')

    await expect(readJsonOrThrow(mockResponse({ ok: false, status: 503, json, text }))).rejects.toThrow(
      'Catalyst responded with status 503: upstream boom'
    )
    expect(text).toHaveBeenCalledTimes(1) // body drained so the keep-alive socket is released
    expect(json).not.toHaveBeenCalled()
  })

  it('When the error body cannot be read, then it still throws with the status', async () => {
    const text = jest.fn().mockRejectedValue(new Error('stream error'))

    await expect(readJsonOrThrow(mockResponse({ ok: false, status: 500, json: jest.fn(), text }))).rejects.toThrow(
      'Catalyst responded with status 500'
    )
  })

  it('When a non-conforming response has no text(), then it still throws with the status', async () => {
    // A fetcher whose Response omits text() must not turn the error into a "text is not a function" crash.
    const response = { ok: false, status: 502, json: jest.fn() } as unknown as FetchResponse

    await expect(readJsonOrThrow(response)).rejects.toThrow('Catalyst responded with status 502')
  })
})
