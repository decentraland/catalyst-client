# dcl-catalyst-client Deployment Protocols

## v1 — Monolithic multipart (legacy)

Single `POST /entities` carrying every file in one multipart body.

Default behavior on servers that don't advertise v2.

## v2 — Partial / resumable

Three-phase protocol designed to:

- Avoid Cloudflare 504 timeouts on large scenes.
- Allow parallel file uploads.
- Recover from mid-upload failures via in-process retries.

### Phase A — init

`POST /entities` with header `Upload-Incomplete: ?1` and a manifest-only multipart
(entity file + signature + `fileSizesManifest` declaring expected file sizes).

Server responds `202 Accepted` with:
```json
{
  "availableFiles": ["QmAlreadyHave"],
  "missingFiles": ["QmNeedThis"],
  "deploymentToken": "<opaque-32-byte>",
  "expiresAt": 1730000000000
}
```

### Phase B — file uploads (parallel)

For each missing file:
`POST /entities/:entityId/files/:fileHash`
Headers: `X-Deployment-Token: <token>`, `Content-Type: application/octet-stream`
Body: raw bytes.

Server responds `204 No Content` on success.

### Phase C — finalize

`POST /entities/:entityId` with header `X-Deployment-Token: <token>` and empty body.

Server responds `200 OK` with `{ creationTimestamp, message }`.

### Failure handling

- `404` mid-upload → deployment was evicted; client re-runs Phase A and resumes.
- `5xx` / network error → client retries with exponential backoff.
- `4xx` other than 404 → fatal; client throws a typed error.

### Capability detection

Client probes `OPTIONS /entities/{any-entityId}/status`. v2-aware servers respond
200/204; legacy servers respond 404. Probe is cached per-server.

### Authentication

- `POST /entities` (init): existing auth-chain on entity payload (unchanged from v1).
- File uploads: unauthenticated; correctness via content-addressed hash check.
- `POST /entities/:entityId` (finalize): re-runs full validation including auth-chain.

`deploymentToken` is a session correlator, not a security boundary. Content
addressing makes per-file signing redundant: the entity's hash list (signed at
init) cryptographically commits to every file hash in the deployment.
