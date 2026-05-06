import * as http from 'http'
import { AddressInfo } from 'net'
import busboy from 'busboy'

export type MockServer = {
  url: string
  close: () => Promise<void>
  setMissingFiles: (files: string[]) => void
  forceEviction: (next: number) => void // server returns 404 for the next N file uploads
  failNextFile: (httpStatus: number) => void
  receivedFiles: () => Map<string, Buffer>
  receivedFinalize: () => boolean
  receivedToken: () => string | undefined
}

export async function startMockContentServer(): Promise<MockServer> {
  let missingFiles: string[] = []
  let evictionRemaining = 0
  let nextFileFailure: number | undefined
  const token = 'tok-mock'
  const received = new Map<string, Buffer>()
  let finalized = false
  let observedToken: string | undefined

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // OPTIONS /entities/:id/status  — capability probe
    if (req.method === 'OPTIONS' && /^\/entities\/[^/]+\/status$/.test(url.pathname)) {
      res.writeHead(200, { Allow: 'GET, OPTIONS' })
      res.end()
      return
    }

    // POST /entities  — init OR finalize, dispatched by header
    if (req.method === 'POST' && url.pathname === '/entities') {
      if (req.headers['upload-incomplete'] === '?1') {
        // init
        const bb = busboy({ headers: req.headers })
        bb.on('file', (_name, stream) => stream.resume())
        bb.on('finish', () => {
          res.writeHead(202, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              availableFiles: [],
              missingFiles,
              deploymentToken: token,
              expiresAt: Date.now() + 60_000
            })
          )
        })
        req.pipe(bb)
        return
      }
    }

    // POST /entities/:id/files/:hash  — file upload
    const fileMatch = url.pathname.match(/^\/entities\/([^/]+)\/files\/([^/]+)$/)
    if (req.method === 'POST' && fileMatch) {
      observedToken = req.headers['x-deployment-token'] as string | undefined
      if (evictionRemaining > 0) {
        evictionRemaining--
        res.writeHead(404).end()
        return
      }
      if (nextFileFailure !== undefined) {
        const code = nextFileFailure
        nextFileFailure = undefined
        res.writeHead(code).end(`Forced ${code}`)
        return
      }
      const fileHash = fileMatch[2]
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.set(fileHash, Buffer.concat(chunks))
        res.writeHead(204).end()
      })
      return
    }

    // POST /entities/:id  — finalize
    const finalizeMatch = url.pathname.match(/^\/entities\/([^/]+)$/)
    if (req.method === 'POST' && finalizeMatch) {
      finalized = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ creationTimestamp: Date.now(), message: 'ok' }))
      return
    }

    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    setMissingFiles: (files) => {
      missingFiles = files
    },
    forceEviction: (next) => {
      evictionRemaining = next
    },
    failNextFile: (status) => {
      nextFileFailure = status
    },
    receivedFiles: () => new Map(received),
    receivedFinalize: () => finalized,
    receivedToken: () => observedToken
  }
}
