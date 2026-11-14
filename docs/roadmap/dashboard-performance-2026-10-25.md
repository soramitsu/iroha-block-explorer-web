# Dashboard performance continuation — 2026-10-25

The recovered “Neumorphic dashboards and data visualization” session's latest
request was to make querying faster, including upstream Iroha changes where
needed. EX-347's visual dashboards were already published; EX-359's performance
changes were still pending. This continuation preserves the existing homepage
and dashboard design.

## Explorer changes

- Network and Activity retain one anonymous block window between routes and
  browser visits, keyed by the canonical NetworkId and Torii endpoint. Private
  readers never persist their window in this public cache.
- The projected block feed includes its authoritative canonical block hash.
  A retained tip must match a fresh overlapping row before reconciliation;
  regressed or divergent chains rebuild the window.
- Cache version 2 retains acquisition time separately from head-read time.
  Refreshes cannot extend the original 30-minute lifetime, and future timestamps
  and old unanchored records are rejected.
- Separate extension and refresh errors preserve failed-history alerts when
  a concurrent head read succeeds. An unchanged retained tip starts its live
  block subscription immediately. Missing-cursor rebuilds preserve the single
  in-flight scan when the selected window grows. A smaller dashboard retains the
  larger window already loaded, so a 1,000→250→1,000 round trip still needs only
  a head read on return, with unchanged or advancing tips.
- Bounded collection scans use 100-row pages again, following the deployed
  Torii decode-limit fix. A 500-transaction sample takes five pages. Block
  history remains at 64 rows until the upstream short-page fix is deployed.
- The development proxy reuses upstream HTTP/TLS connections.
- Two pre-existing test-storage isolation issues were corrected in API and
  Econometrics tests. Three existing lint errors in dataspace grouping and
  cancellation handling were removed without changing their behavior.

## Upstream query changes

The existing worktree `../iroha-explorer-chain-stats`, on branch
`explorer/chain-stats-endpoint` based on `optimizations` commit `2864406860`,
contains the related Torii and Core changes:

- Height bounds narrow the canonical history walk before row filtering. Cursor
  identity includes those bounds, and the complete filter still checks each row.
- A bounded 16,384-row summary cache shares capacity across exact reader
  visibility scopes. Cache hits validate the canonical journal identity, block
  slot and hash; unavailable, replaced, mutated, poisoned or recovered sources
  cannot reuse a cached summary. Sidecar and evicted bodies use the authoritative
  read path.
- A page stops before exhausting its history owner and returns a continuation
  for the unread height. A single intrinsically oversized block retains its
  permanent budget error. Reservation covers the public query projection and
  final response, as well as the native history walk.
- The dedicated block-history worker retains the request's admission, budget
  ownership and recoverable join behavior. Regression tests exercise both the
  native page and the complete public query response.

These changes have not been deployed or benchmarked on a live validator.
Journal appends conservatively invalidate cached summary tokens, so the cache's
benefit under an actively committing workload still needs live measurement.

## Validation and release boundary

Validation logs are retained in `output/dashboard-takeover-20261025/`.
That directory also preserves the recovered local Taira preview configuration
as `vite.taira.mts`, so it does not depend on Claude's temporary session files.
It serves the observed runtime identity locally and proxies genuine public reads;
it is not a deployment configuration.
The exact toolchain is Node 24.19.0 and pnpm 10.11.0. SDK package integrity was
verified against all 260 admitted files. Focused cache/API/analytics validation
passed 98 tests; chart/navigation/localization validation passed 111 tests.
The full suite passes 2,027 tests across 190 files, with one existing opt-in
test skipped. All 31 block-window composable tests pass, including both dashboard
round trips and the concurrent missing-cursor rebuild. The first run hit
five-second I/O deadlines in SDK/release-tool
fixtures; the successful run uses 30-second test/hook deadlines and four workers,
with every assertion enabled. Typecheck, production build, repository ESLint
with zero errors, roadmap validation and all bundle budgets pass. Startup is
472,977 of 540,000 allowed gzip bytes. The final lint cleanup also passes its
23 focused dataspace/read-session tests.

The combined native validation uses the existing warm target and Apple's system
linker, with Cargo's normal jobserver:

```sh
scripts/cargo_fast.sh --stable-local-metadata --incremental -- \
  test -p iroha_core -p iroha_torii --lib \
  --no-default-features --features iroha_torii/default -- \
  canonical_summary explorer_ collections:: history_producer:: canonical_history::
```

The resulting Torii test executable passes all 185 selected tests, with none
ignored (`torii-final.log`). The first Core run passed 34 of 35; the remaining
test incorrectly applied an unavailable-body helper to an already malformed
journal. Its prefix audit correctly rejected the malformed frame. The repaired
test uses separate certified fixtures for mutation and unavailability, with no
production-code changes after the Torii run. Core then passes all 35 selected tests, with none ignored (`core-final.log`),
using the matching feature set:

```sh
scripts/cargo_fast.sh --stable-local-metadata --incremental -- \
  test -p iroha_core --lib --no-default-features \
  --features app_api,runtime,gost,sm,telemetry,zk-stark,iroha-core-tests -- \
  canonical_summary canonical_history:: explorer_
```

Browser checks use the local development build against the existing public
Taira API, not mocked response data. All three dashboards render live data;
Ledger displays its domain and asset-definition collections and explicitly
labels the bounded 1,000-account sample. Initial checks measured approximately
2.9 seconds to show the retained 1,000-block window on reload and 0.6 seconds to
navigate to Network with retained history. The final hash-anchored cache restored
the Network dashboard's 250-block view in approximately 0.3 seconds with warm
development assets. These are local development UI observations, not production
cold-query benchmarks.

The final cold Activity check still encounters the deployed Torii budget bug:
six 64-row pages succeed from height 4,109 through 3,726, then page seven returns
HTTP 500 `internal_server_error`. A direct genuine SDK probe reproduces it in
`live-block-query.json`; the UI retains 384 rows and reports an incomplete read
with Retry. No client page-size fallback or synthetic completion was introduced.

Upstream height seeking, block summaries and partial-page budget handling pass
the focused local gates in `../iroha-explorer-chain-stats`. Live cold/warm
qualification and deployment remain pending. Do not enable concurrent height-range fetching or raise the
block page size before that rollout. This continuation has not published an
Explorer release or modified validators.

The evidence directory contains both candidate patches, exact base revisions,
per-file source hashes and validation-log hashes in `source-validation.json`.
Both repositories retain their changes locally for review; this continuation
has not committed or pushed them.
