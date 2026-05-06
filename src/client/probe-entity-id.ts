import { IFetchComponent } from '@well-known-components/interfaces'

/**
 * A real, well-formed but never-deployed entityId. Used as the path arg to the
 * OPTIONS probe so the request looks legitimate to LB/observability tooling.
 *
 * The probe doesn't need this entity to exist — Express-style routers respond
 * to OPTIONS based on registered route patterns, not on resource existence.
 *
 * If callers want the probe to use a real entityId (e.g. for audit-log hygiene),
 * a future extension can fetch it from /world/:name/about (Worlds) or the
 * (0,0) parcel pointer (Catalyst Phase 2). Out of scope here.
 */
const HARDCODED_PROBE_ENTITY_ID = 'bafkreig5oqsdgjbcl6avgegwacw5kywuhyqcnlc5e5pftn4hi5w7v6gyme'

export async function resolveProbeEntityId(
  _serverUrl: string,
  _fetcher: IFetchComponent
): Promise<string> {
  return HARDCODED_PROBE_ENTITY_ID
}
