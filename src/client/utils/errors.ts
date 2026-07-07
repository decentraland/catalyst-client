/** Base error for a failed deployment. Carries the HTTP status and raw response body when available. */
export class DeploymentError extends Error {
  constructor(message: string, public readonly status?: number, public readonly responseBody?: string) {
    super(message)
    this.name = 'DeploymentError'
  }
}

/**
 * The server rejected the deployment with a validation error (HTTP 400) — e.g. the deployment exceeds
 * the size budget, or a signature/permission check failed. Terminal: retrying will not help.
 */
export class PartialDeploymentValidationError extends DeploymentError {
  constructor(message: string, status?: number, responseBody?: string) {
    super(message, status, responseBody)
    this.name = 'PartialDeploymentValidationError'
  }
}

/**
 * The target server does not support partial deployments: it ran the full deployment pipeline on a
 * staging request and rejected it because referenced content was not uploaded or stored. Fall back to
 * `deploy()` (a single request) against such a server. Best-effort detection via the server's error text.
 */
export class PartialDeploymentNotSupportedError extends DeploymentError {
  constructor(message: string, status?: number, responseBody?: string) {
    super(message, status, responseBody)
    this.name = 'PartialDeploymentNotSupportedError'
  }
}
