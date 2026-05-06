# Migrating from `dcl-catalyst-client@21.x` to `22.x`

## TL;DR

For most consumers: bump the dep, no code changes needed. v2 is auto-detected.

## What changed

- New default: `client.deploy()` probes the target server with `OPTIONS /entities/:id/status`
  and uses the v2 protocol when supported. Legacy servers fall back to v1 transparently.
- New error types exposed: `DeploymentInitError`, `FileUploadError`, `FinalizeError`,
  `ProtocolUnsupportedError`. They all extend `Error`.
- New `DeploymentOptions` fields (all optional): `deploymentProtocolVersion`, `parallelism`,
  `retries`, `retryBaseDelayMs`, `resumeOnEviction`, `onProgress`.

## What stayed the same

- `deploy()` returns the `Response` from the server (HTTP layer object). Callers
  inspecting `.status`, `.json()`, `.text()` are unaffected.
- v1 codepath is byte-for-byte unchanged.
- `DeploymentData` shape unchanged.

## Forcing v1 (escape hatch)

If a regression turns up against a specific server, force v1:

```typescript
await client.deploy(deployData, { deploymentProtocolVersion: 'v1' })
```

We commit to keeping v1 alive at minimum until 2 majors past v2-default ship.

## Test mocks

If your test mocks intercept `POST /entities`, note that v2 init looks identical
to v1 except for the `Upload-Incomplete: ?1` header and the absence of content
files in the multipart body. Two options:

1. Force v1 in tests: `{ deploymentProtocolVersion: 'v1' }`.
2. Update mocks to handle the new v2 endpoints (`POST /entities/:id/files/:hash`,
   `POST /entities/:id`, `OPTIONS /entities/:id/status`).
