# Explorer Telemetry Metrics – Torii Requirements

This document expands EX-003’s remaining dependency: Explorer needs richer telemetry/peer payloads from Torii in
order to drop the last bits of the legacy `/api` backend. With `/v1/explorer/metrics` and `/v1/telemetry/peers-info`
now implemented in Torii, the frontend can migrate to the direct payloads described below.

The original gaps were:

1. An aggregated “Explorer metrics” DTO that matches what the dashboard expects (peers/domains/accounts/assets,
   tx accepted/rejected, block stats, averages).
2. Peer metadata (geo/IP + connected peers) so the UI can display meaningful context instead of “Unknown”.

## Current Torii Endpoints

| Endpoint                  | Provides                               | Missing                                                                 |
| ------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `/v1/explorer/metrics`    | Explorer aggregate counters             | Used by dashboard/home summary cards.                                   |
| `/v1/telemetry/peers-info`| list of peers with config/gossip stats  | No geo/IP metadata; connected peers = `null`.                           |
| `/v1/telemetry/live`      | SSE stream (network + peer events)      | Format is adequate, but Explorer still derives aggregates itself.       |

## Requested Aggregated Endpoint

Expose `/v1/explorer/metrics` that wraps the telemetry counters and surfaces the same shape the frontend already
uses (`src/shared/api/schemas.ts:195-222`). Example DTO:

```jsonc
{
  "peers": 7,
  "domains": 4,
  "accounts": 123,
  "assets": 87,
  "transactions_accepted": 350,
  "transactions_rejected": 12,
  "block": 1024,
  "block_created_at": "2024-03-20T12:34:56Z",
  "finalized_block": 1018,
  "avg_commit_time": { "ms": 950 },
  "avg_block_time": { "ms": 6200 }
}
```

This can be a thin wrapper around Torii telemetry internals, but having a stable REST endpoint allows the Explorer to
drop its home-grown aggregation logic.

## Peer Metadata Requirements

Augment the `PeerInfo` payload or expose a sibling endpoint so each peer includes:

| Field                 | Description                                  |
| --------------------- | ---------------------------------------------|
| `location`            | `{ lat, lon, country, city }` (geo lookup).  |
| `ip` / `hostname`     | Raw network endpoint, for troubleshooting.   |
| `connected_peers`     | List of peer URLs currently connected.       |
| `software_version`    | (Optional) if available from telemetry.      |

The Explorer already understands these fields (see `src/shared/api/schemas.ts:195-222`). Today Torii returns
`null` for all of them; once populated, the UI can render actual data instead of “Unknown”.

## SSE Considerations

Torii already emits `network_status`, `peer_info`, and `peer_status` events via `/v1/telemetry/live`. After the
REST payloads include the enriched metadata, the SSE stream should reuse the same shape (i.e., when a `peer_info`
event is sent, include the new geo/IP fields so the UI updates without extra fetches).

**Explorer status:** the telemetry dashboard now consumes `/v1/explorer/metrics`, `/v1/telemetry/peers-info`, and the
new `/v1/sumeragi/status(+/sse)` + `/v1/sumeragi/telemetry` payloads. The Nodes page renders consensus cards (leader,
highest/locked QC, queue state, pacemaker/RBC counters), VRF summaries, RBC backlog stats, QC latencies, and
availability collectors directly from Torii without relying on the legacy backend proxy.

## Next Steps

1. Torii team: implement the richer peer metadata + `/v1/explorer/metrics` wrapper.
2. Explorer team: once available, update `src/shared/api/schemas.ts` + the telemetry views to consume the new
   fields and remove the last references to “Unknown” placeholders or legacy backend logic.

Tracking reference: EX-003 in `ROADMAP.md`.
