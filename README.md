# Decentraland Catalyst Client

The Catalyst Client library allows you to interact with Decentraland's [Catalyst servers](https://github.com/decentraland/catalyst). It enables fetching data and deploying new entities to the Catalyst server of your choice.

[![Coverage Status](https://coveralls.io/repos/github/decentraland/catalyst-client/badge.svg?branch=master)](https://coveralls.io/github/decentraland/catalyst-client?branch=master)

## Installation

Install the package via `npm`:

```bash
npm install dcl-catalyst-client
```

### Examples

Please check the [examples repository](https://github.com/decentraland/catalyst-client-examples)

### Partial (batched) deployments

For entities too large to upload in a single request, use `deployPartial`. It splits the content into
size-bounded batches and uploads them across several `POST /entities` requests; the entity only becomes
live once the server has all of it (the server finalizes automatically on the completing request).

```ts
const result = await client.deployPartial(
  { entityId, authChain, files },
  {
    // default: 100 MiB per request — requests larger than ~200MB are timed out by the
    // infrastructure in front of the content servers, so keep a margin under that.
    maxBatchSizeBytes: 100 * 1024 * 1024,
    concurrency: 2, // default: 2 parallel batch uploads (after the first)
    maxResumeAttempts: 3, // default: 3 — resumes on network/5xx failures
    onProgress: ({ uploadedBytes, totalBytes }) => console.log(`${uploadedBytes}/${totalBytes}`),
    // byte-level progress, also accepted by deploy()
    onUploadProgress: ({ phase, sentBytes, totalBytes }) => console.log(phase, `${sentBytes}/${totalBytes}`)
  }
)
console.log(result.creationTimestamp)
```

Notes:

- Use the regular `deploy()` for normal-sized deployments; it accepts `onUploadProgress` too.
- `onUploadProgress` reports file bytes handed to the HTTP client across every request, in the phases
  `checking` (asking the server which files it has), `uploading` and `processing` (every scheduled byte
  sent, waiting for the server). Events are throttled to one every 200 ms, plus every phase change and the
  latest count at the end of each window. A resolved deployment ends with `processing` and every byte sent.
  Re-sent content (retries, the server's missing list) grows `totalBytes`.
- By default a request's bytes count when its response arrives. For live progress, create the client with
  `streamingUploads: true`: on Node the body is then streamed with an exact `Content-Length`, at the cost of
  memory: each request in flight holds its form plus an encoded copy of it, about twice the batch size, so
  `deployPartial` with the default `concurrency` (2) and 100 MiB batches holds up to ~400 MiB on top of the
  scene's files. Only set it when the fetcher passes the body to the global
  (undici) `fetch`, forwards the `duplex` option and headers unchanged, and never retries a POST with the
  same options (the stream can only be read once). `@dcl/fetch-component` qualifies; node-fetch does not.
- The target server must support partial deployments. Against an older server that does not, a
  single-batch deployment still succeeds, but a multi-batch one rejects with
  `PartialDeploymentNotSupportedError` — fall back to `deploy()` in that case.
- A validation failure on the finalizing request (e.g. exceeding the size budget) rejects with
  `PartialDeploymentValidationError`.
- Files are never split across requests: a single file larger than the batch cap is sent alone in its
  own request. Per-file server caps still apply to it, and a request beyond ~200MB may be timed out by
  the infrastructure regardless of the configured cap.
