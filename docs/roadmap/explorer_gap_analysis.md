# Explorer vs. Torii Capability Matrix

This document maps every dataset the current Explorer UI consumes to the upstream capabilities in `../iroha` (Torii/Iroha core). Use it to drive the Torii/API work (EX-002) and the frontend refactor (EX-003).

## Legend

- **Explorer Needs** – Fields/UI behaviour defined in the web repo (see `src/shared/api/schemas.ts`, `src/pages/**`).
- **Current Source** – Current Torii route or Explorer data source providing the data.
- **Torii Surface** – Existing handler or doc reference in `../iroha`.
- **Gap / Action** – What we must add or change in Torii to keep parity (Norito-friendly, streaming where noted).

---

### Accounts (list + filters)
- **Explorer Needs:** `id`, `ih58_address`, `compressed_address`, `network_prefix`, `metadata`, `owned_assets`, `owned_nfts`, `owned_domains`, filter by `domain` or `with_asset`, pagination (`src/shared/api/schemas.ts:47-74`, `src/pages/AccountsList.vue`).
- **Current Source:** Torii `/v1/explorer/accounts` (plus `/accounts/query` when filters are provided) via `handler_explorer_accounts_list` (`../iroha/crates/iroha_torii/src/lib.rs`).
- **Torii Surface:** `routing::handle_v1_explorer_accounts` already walks world state, builds IH58/compressed addresses, and attaches aggregate counters + pagination metadata.
- **Gap / Action:** **DONE** – frontend fetchers now call the Torii explorer handlers directly. Keep parity by mirroring any future schema additions from `ExplorerAccountDto`.

### Account Details
- **Explorer Needs:** addresses, metadata, tabs for assets/NFTs/domains, QR copy, transactions/instructions filtered by authority (`src/pages/AccountDetails.vue`).
- **Current Source:** Torii `/v1/explorer/accounts/{id}` handler (`../iroha/crates/iroha_torii/src/lib.rs`) plus the `/assets`, `/nfts`, `/domains`, `/transactions` explorer endpoints used by the tabs.
- **Torii Surface:** `handle_v1_explorer_account_detail` emits the exact DTO (`ExplorerAccountDto`) the UI expects; related list endpoints share the same aggregates/filters.
- **Gap / Action:** **DONE** – detail views already rely on Torii. Remaining improvements live under the Transactions/Instructions section (richer payloads/SSE).

### Asset Definitions
- **Explorer Needs:** `id`, `mintable`, `logo`, `metadata`, `owned_by`, `assets` count (`src/shared/api/schemas.ts:93-113`, `src/pages/AssetsList.vue`, `src/pages/AssetDetails.vue`).
- **Current Source:** Torii `/v1/explorer/asset-definitions` (list/detail) implemented in `../iroha/crates/iroha_torii/src/lib.rs`.
- **Torii Surface:** `GET /v1/explorer/asset-definitions` (with `domain`/`owned_by` filters) + `/v1/explorer/asset-definitions/{id}` already expose metadata, mintability, owner, and per-definition asset counters.
- **Gap / Action:** **DONE** – frontend fetchers now point at `/asset-definitions` on the Torii explorer base. Keep monitoring `ExplorerAssetDefinitionDto` whenever Norito payloads evolve.

### Assets / Holdings
- **Explorer Needs:** Asset list filtered by owner or definition, with `value` as decimal string plus nested IDs (`src/shared/api/schemas.ts:117-126`, `AssetDetails.vue`).
- **Current Source:** Torii `/v1/explorer/assets` (`../iroha/crates/iroha_torii/src/lib.rs`) and `/v1/explorer/assets/{id}`.
- **Torii Surface:** `ExplorerAssetDto` exposes `{id, definition_id, account_id, value}` strings computed from world state and respects `owned_by` + `definition` filters.
- **Gap / Action:** **DONE** – UI now consumes these handlers directly. Future enhancements (metadata per holding, pagination tweaks) should start from the Torii DTO.

### NFTs
- **Explorer Needs:** `id`, `owned_by`, metadata content, filters by owner/domain (`src/shared/api/schemas.ts:115-134`, `NftPages`).
- **Current Source:** Torii `/v1/explorer/nfts` (`../iroha/crates/iroha_torii/src/lib.rs`) and `/v1/explorer/nfts/{id}`.
- **Torii Surface:** `ExplorerNftDto` already includes metadata, owner, and domain filters.
- **Gap / Action:** **DONE** – frontend uses the explorer endpoints; keep monitoring Norito payload changes (e.g., richer metadata typing).

### Domains
- **Explorer Needs:** `id`, `logo`, `metadata`, `owned_by`, `accounts`, `assets`, `nfts` counts (`src/shared/api/schemas.ts:137-151`, `Domain pages`).
- **Current Source:** Torii `/v1/explorer/domains` and `/v1/explorer/domains/{id}` via `handler_explorer_domains_list` and `handler_explorer_domain_detail` (`../iroha/crates/iroha_torii/src/lib.rs`).
- **Torii Surface:** `ExplorerDomainDto` exposes logo/metadata/ownership plus aggregate counters sourced from `ExplorerAggregates`.
- **Gap / Action:** **DONE** – ensure the UI keeps parity with new Torii fields as they land.

### Blocks
- **Explorer Needs:** list and detail with hash, height, timestamps, tx stats, links to prev block (`src/shared/api/schemas.ts:153-181`, `src/pages/BlocksList.vue`, `BlockDetails.vue`).
- **Current Source:** Torii `/v1/explorer/blocks` (`../iroha/crates/iroha_torii/src/lib.rs`) and `/v1/explorer/blocks/{identifier}` (`../iroha/crates/iroha_torii/src/lib.rs`).
- **Torii Surface:** `ExplorerBlockDto` includes hashes, timestamps, totals, and previous hash references.
- **Gap / Action:** **DONE** – Explorer now renders Torii data. Follow up when Norito gains richer block metadata (e.g., commit signatures).

### Transactions & Instructions
- **Explorer Needs:** paginated `/transactions` (filters: `authority`, `block`, `status`) and `/instructions` (filter by hash/instruction kind). UI expects `DetailedTransaction` with metadata, TTL, nonce, rejection reason (`src/shared/api/schemas.ts:183-230`, `TransactionsTable.vue`, `InstructionsTable.vue`).
- **Current Source:** Torii `/v1/explorer/transactions`, `/v1/explorer/transactions/{hash}`, `/v1/explorer/instructions`, `/v1/explorer/instructions/{hash}/{index}`, plus SSE feeds under `/v1/explorer/transactions/stream` + `/v1/explorer/instructions/stream`.
- **Torii Surface:** `ExplorerTransactionDto`/`ExplorerTransactionDetailDto` provide status, metadata, TTL, nonce, signature, and rejection reason. Instructions now expose Norito JSON (`{ kind, payload, wire_id?, encoded? }`) plus encoded bytes when needed.
- **Gap / Action:** **DONE** – Explorer tables consume the new SSE feeds and Norito payloads directly from Torii, so the legacy backend proxy/listeners are no longer required.

### Telemetry / Network Metrics
- **Explorer Needs:** counts (peers, domains, accounts, assets, tx accepted/rejected, block stats, avg commit/block times) plus live stream (`HomePageInfo`, `NodesTelemetry`).
- **Current Source:** Torii `/v1/explorer/metrics`, `/v1/telemetry/peers-info`, `/v1/telemetry/live`, `/v1/sumeragi/status(+/sse)`, and `/v1/sumeragi/telemetry` wired through `src/shared/api/index.ts`.
- **Torii Surface:** `routing.rs` exposes telemetry JSON + SSE when the feature is enabled; Explorer now reads them directly (no backend proxy).
- **Gap / Action:** **DONE** – the frontend pulls `/v1/explorer/metrics`, `/v1/telemetry/peers-info`, `/v1/sumeragi/status`, and `/v1/sumeragi/telemetry` without the legacy `/api` proxy, so the telemetry pages show consensus/VRF/RBC snapshots alongside the node table.

### Peers Info
- **Explorer Needs:** `url`, `connected`, telemetry support flag, config fields, geo info, connected peers list (`src/shared/api/schemas.ts:199-222`, `NodesTelemetry.vue`).
- **Current Source:** Torii `/v1/telemetry/peers-info` (REST) + `/v1/telemetry/live` SSE, consumed directly by the frontend.
- **Torii Surface:** exposes connectivity + config + gossip metrics; geo metadata still absent.
- **Gap / Action:** Request Torii to enrich the payload (geo/IP metadata, connected peers list) so the UI can drop the placeholder “Unknown” values without relying on the removed backend aggregator. Details live in `docs/roadmap/telemetry_metrics_spec.md`.

### Governance / KAIGI / ZK / SoraFS
- **Explorer Needs:** currently absent but roadmap demands surfacing new Iroha capabilities (governance votes, KAIGI relay health, SoraFS pin registry, proof telemetry). Docs in `../iroha/docs/source/torii/*.md`, `sorafs_*` crates.
- **Current Source:** none.
- **Torii Surface:** dedicated handlers exist (e.g., `handle_v1_kaigi_relays` in `routing.rs`, SoraFS endpoints under `/v1/sorafs/*`, governance status under `/v1/sumeragi/status`, ZK proof tags). Explorer must add UI + call them.
- **Gap / Action:** Governance dashboard now consumes the REST endpoints + `/v1/gov/stream` (see `docs/roadmap/governance_sse_spec.md`), but Torii still needs to emit the `ReferendumUpdated`/`LocksUpdated`/`TallyUpdated`/`ProposalUpdated` events to finish the stream. KAIGI/SoraFS/ZK UIs remain on the backlog.

### Streaming / Norito Usage
- **Explorer Needs:** Live blocks/transactions, telemetry updates, proof events, KAIGI relay SSE.
- **Current Source:** backend proxies SSE.
- **Torii Surface:** `handle_blocks_stream`, `handle_v1_events_sse`, `handle_v1_new_view_sse`, KAIGI SSEs.
- **Gap / Action:** Frontend must open WS/SSE directly to Torii with appropriate auth headers, handle Norito payloads, and fall back to JSON where necessary.

---

## Next Steps (per Roadmap)
1. EX-001 (this doc) – Keep updating as we discover new data needs or Torii capabilities.
2. EX-002 – Implement the Torii endpoints highlighted above (Norito-first, JSON fallback).
3. EX-003 – Replace the Explorer data layer with direct Torii/Norito/WebSocket clients.
4. EX-004 – Design UI for governance, KAIGI, SoraFS, proof telemetry using the new APIs.
5. EX-005 – Back every new API/client/helper with tests (Rust + TypeScript).
