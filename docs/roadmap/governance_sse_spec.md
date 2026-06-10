# Governance SSE Requirements

## Goal
Provide a single Torii EventSource endpoint that pushes governance mutations so the Explorer can keep the dashboard panels (council, unlock stats, referenda, locks, tally, proposals) in sync without manual refreshes.

## Endpoint
`GET /v1/gov/stream`

- Transport: SSE (text/event-stream)
- Authentication: same as other `/v1/gov/*` handlers
- Rate limiting: reuse explorer stream bucket

## Events
Each SSE message MUST be a JSON object with a `kind` discriminator.

| Kind | Payload | Consumer action |
| --- | --- | --- |
| `CouncilUpdated` | `{ epoch: u64, members: [AccountId] }` | Refetch `/gov/council/current` |
| `UnlockStatsUpdated` | `{ height_current, expired_locks_now, referenda_with_expired, last_sweep_height }` | Refetch `/gov/unlocks/stats` |
| `ReferendumUpdated` | `{ id: ReferendumId }` | If the dashboard currently displays this referendum, refetch `/gov/referenda/{id}` |
| `LocksUpdated` | `{ referendum_id: ReferendumId }` | If open, refetch `/gov/locks/{id}` |
| `TallyUpdated` | `{ referendum_id: ReferendumId }` | If open, refetch `/gov/tally/{id}` |
| `ProposalUpdated` | `{ id: ProposalId }` | If open, refetch `/gov/proposals/{id}` |

Fields can be extended with summaries, but the `*_id` properties MUST be strings (matching the REST ids) so the Explorer can route updates.

## Explorer handling
- `src/shared/ui/composables/useGovernanceEvents.ts` owns the shared EventSource instance.
- `useGovernanceMetrics` listens for `CouncilUpdated`/`UnlockStatsUpdated` and refetches the cached REST responses.
- `GovernanceDashboard.vue` subscribes to the same stream to refetch the currently inspected referendum/proposal.

## Open Items
- Torii must emit the new `ReferendumUpdated`, `LocksUpdated`, `TallyUpdated`, and `ProposalUpdated` events.
- Once Torii ships the events, add smoke coverage for the dashboard to ensure the auto-refresh path triggers without user input.
