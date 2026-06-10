# Explorer Instruction Payload Requirements

This note documents the expectations for EX-006 (“Wire Torii explorer detail endpoints … Norito SSE feeds and
richer instruction payload JSON”). Frontend work is blocked until the Torii handlers emit the data described here.

## Current State

- `../iroha/crates/iroha_torii/src/explorer.rs` creates `ExplorerInstructionBoxDto` with:
  - `encoded`: a Norito-encoded hex string (via `instruction.dyn_encode()`).
  - `json`: a fallback map `{ kind: { wire_id, encoded } }`, i.e. it does **not** represent the actual Norito payload.
- The Explorer UI (`src/shared/ui/components/InstructionsTable.vue`, `src/pages/TransactionDetails.vue`) currently reads the
  `wire_id` + encoded bytes and renders opaque data. We can’t inspect or format instructions meaningfully.
- SSE feeds still stream through the legacy backend. Torii exposes REST detail endpoints only.

## Desired Torii Payload

Every `ExplorerInstructionBoxDto` should expose a Norito-friendly JSON tree so we can render specific instruction
arguments without extra byte decoding in the UI. The format can mirror the Norito schema you already use for other payloads:

```json
{
  "encoded": "0x...",
  "json": {
    "kind": "Register",
    "payload": {
      "object": {
        "type": "Domain",
        "id": "wonderland"
      },
      "owner": "alice@test",
      "metadata": { "label": "Wonderland" }
    }
  }
}
```

Suggested structure:

| Field        | Type     | Notes                                                                                         |
| ------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `kind`       | string   | One of the existing `ExplorerInstructionKind` strings (“Register”, “Mint”, …).                 |
| `payload`    | object   | Instruction-specific JSON. Mirrors the Norito schema (e.g. `Transfer` exposes `source`, etc.). |
| `wire_id`    | string   | (Optional) keep for debugging.                                                                 |
| `encoded`    | string   | (Optional) keep the Norito bytes for debugging/tooling.                                         |

The frontend will prioritize `payload`. `wire_id` + `encoded` remain fallbacks for unknown instructions.

## SSE Feed Requirements

To fully close EX-006 we also need Torii SSE endpoints:

| Feed                    | Path suggestion                  | Notes                                                                         |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| Transactions timeline   | `/v1/explorer/transactions/stream` | Emits `Committed`/`Rejected` transactions with hashes + summarized payloads.  |
| Instructions timeline   | `/v1/explorer/instructions/stream` | Emits instruction events (kind + payload) tied to transaction hash + block.   |

The payload schema can mirror the REST DTOs so the UI reuses the same zod types.

## Next Actions

1. Torii team: implement the JSON payload serialization + SSE feeds described above.
2. Explorer team: once Torii exposes them, update `src/shared/api/schemas.ts` + consuming components to render the
   richer data (and migrate the SSE consumers away from the backend proxy).

Tracking reference: EX-006 in `ROADMAP.md`.
