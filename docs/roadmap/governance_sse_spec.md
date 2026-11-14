# Governance Explorer Authentication Boundary

This document supersedes the pre-release anonymous governance-dashboard proposal. Current Torii exposes
`/v1/gov/stream` as a canonical-account-authenticated SSE protocol route, not as a public Explorer synchronization
contract. The first-release public Explorer has no signing context and therefore does not open that stream.

## Current contract

- `/v1/gov/capabilities` requires canonical account authentication. Its response describes network governance
  readiness and supported routes; it does not grant or report the caller's authorization.
- `/v1/gov/stream` requires canonical account authentication and streams governance events only after that exact
  admission check.
- Other `/v1/gov/*` reads and writes enforce their current canonical-account, witness, or operator policy in Torii.
- The retired `/v1/gov/council/current` route is not queried.
- The public Explorer does not embed signing keys, issue unsigned protected reads, poll deprecated routes, or translate
  `401`/`403` into empty governance state.

Canonical single-signature requests bind the exact account, signature, timestamp, nonce, method, path/query, body, and
`NetworkId`. Multisig requests additionally carry the current witness contract. Signing belongs in an authenticated
wallet/workspace, not in a static public dashboard.

## Explorer behavior

`GovernanceDashboard.vue` documents this boundary and the current route semantics. The deleted
`useGovernanceEvents`/`useGovernanceMetrics` anonymous dashboard path is not a supported public capability.

If an authenticated governance workspace is added later, it must use the current browser SDK signing primitives and
strict response DTOs, keep secrets outside persisted/browser configuration, and test every permission and replay path.
It must consume the current authenticated `/v1/gov/stream` contract directly and must not revive any retired route or
unsigned compatibility path.
