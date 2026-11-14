# Explorer Instruction Norito Contract

This is the current first-release instruction contract. It supersedes the historical proposal that treated wire IDs or
encoded bytes as presentation fallbacks.

## Required response evidence

Every instruction row/detail returned by current Torii includes:

- the top-level canonical display `kind`;
- `box.encoded`, a `0x`-prefixed lowercase Norito instruction encoding;
- `box.framed_sha256`, the `0x`-prefixed lowercase SHA-256 digest of the canonical framed instruction;
- `box.json.kind`, `box.json.wire_id`, `box.json.encoded`, and `box.json.payload`;
- canonical transaction hash/status, authority, block, index, and creation time.

All fields are required and the frontend schema is strict. The Explorer does not accept `r#box`, alternate boxes,
missing evidence, a JSON map keyed by instruction kind, or a payload inferred from the first object key. Encoded evidence
is preserved for verification; presentation is derived from the canonical structured payload and wire identity.

## Lists, details, and streams

| Operation                         | Current route                                                            |
| --------------------------------- | ------------------------------------------------------------------------ |
| Snapshot-bound history            | `GET /v1/explorer/instructions?limit=...&cursor=...`                     |
| Exact instruction detail          | `GET /v1/explorer/instructions/{transaction_hash}/{index}`               |
| Contract view for one instruction | `GET /v1/explorer/instructions/{transaction_hash}/{index}/contract-view` |
| Live invalidation/event feed      | `GET /v1/explorer/instructions/stream`                                   |

The history cursor must advance and remain bound to its returned snapshot. SSE is opened directly to Torii and shares
the same current route family; there is no backend relay or polling compatibility path.

## Change rule

When upstream adds an instruction variant, update the authoritative Torii projection and the strict frontend semantic
presentation together. Add positive evidence tests and rejection tests for incomplete, ambiguous, or non-canonical
shapes. Do not add a client-only decoder or payload guess to mask an incomplete server contract.
