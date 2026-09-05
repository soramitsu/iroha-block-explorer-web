# Explorer Telemetry Contract

This document records the current first-release telemetry boundary. It supersedes the pre-release proposal for an
anonymous aggregate metrics dashboard.

## Browser-readable sources

| Endpoint                        | Purpose                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /v1/explorer/health`       | Strict head height, head time, and sample time used for availability and failover probes.               |
| `GET /v1/telemetry/peers-info`  | Typed peer snapshot used by the node table.                                                             |
| `GET /v1/telemetry/live`        | SSE bootstrap and events with `first`, `network_status`, `peer_info`, `peer_status`, and `propagation` discriminants.          |

`NodesTelemetry.vue` initializes peer rows from the documented peer snapshot and consumes propagation bootstrap plus
all subsequent typed state from `/v1/telemetry/live`. Missing optional location metadata is shown as unknown; the
Explorer does not invent geo data, derive an alternate peer graph, or query the unprojected
`/v1/telemetry/propagation` diagnostic route.

## Deliberately excluded diagnostics

- `/status`, `/status/blocks`, `/status/peers`, and `/metrics` are cataloged as unauthenticated `Diagnostic` routes,
  not typed public application APIs. Torii may still limit their availability through its global API-token/admitted-
  CIDR policy. They are not browser reads and are not exposed by the Explorer's Vite or deployment-specific proxies.
- `/v1/explorer/metrics` requires canonical-signature authentication in current Torii. It is not an anonymous home or
  node-dashboard source.
- `/v1/sumeragi/status`, Sumeragi telemetry, and lane-governance internals are protected operational surfaces. The
  public node page does not query them and has no anonymous fallback.

Operator monitoring may scrape `/metrics` when Torii's global policy admits the caller by CIDR or API token.
Credentials and CIDR admission stay outside the browser bundle.

## Change rule

Any new browser telemetry must first be explicitly classified public in `../iroha`, have an exact current DTO or SSE
event schema, and receive strict parser plus multi-path tests here. Do not expose a diagnostic route through a browser
proxy to make a page appear populated.
