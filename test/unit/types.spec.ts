import { DeploymentProtocolVersion, DeploymentOptions } from '../../src/client/types'

describe('types', () => {
  it('DeploymentProtocolVersion accepts the three documented values', () => {
    const v1: DeploymentProtocolVersion = 'v1'
    const v2: DeploymentProtocolVersion = 'v2'
    const auto: DeploymentProtocolVersion = 'auto'
    expect([v1, v2, auto]).toEqual(['v1', 'v2', 'auto'])
  })

  it('DeploymentOptions exposes the v2 fields', () => {
    const opts: DeploymentOptions = {
      deploymentProtocolVersion: 'v2',
      parallelism: 8,
      retries: 5,
      retryBaseDelayMs: 1000,
      resumeOnEviction: false,
      onProgress: () => {}
    }
    expect(opts.parallelism).toBe(8)
  })
})
