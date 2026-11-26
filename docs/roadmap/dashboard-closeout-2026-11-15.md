# Dashboard performance closeout — 2026-11-15

This record closes the source and evidence trail for EX-347, EX-349 and EX-357–EX-359.
It follows the [rollout record](taira-dashboard-rollout-2026-10-25.md) and
the [implementation report](dashboard-performance-2026-10-25.md). No
feature was rebuilt, and no validator or public site was changed. Evidence
is retained in `output/closeout-20261115/`.

## Release source

- Explorer release `20261025T114146Z` was built from `9dc6e97` plus an
  uncommitted working tree. That source is now commit `8bd7692`. All 22
  source and implementation-report files match the frozen candidate's
  per-file SHA-256 record (`output/taira-dashboard-deploy-20261025/explorer-candidate.json`).
  The EX-333 OVH staging note from 2026-10-28 belongs to separate work and
  was left out of that commit.
- A rebuild of those bytes on 2026-11-15, with Node 24.19.0 and pnpm 10.11.0,
  reproduces all 204 built files byte for byte (`rebuild-vs-deployed.json`).
  `config.json` is rendered per network at publication, so a plain build
  does not produce it.
- The same bytes pass SDK integrity, typecheck, production build, bundle
  budgets (startup 472,985 of 540,000 gzip bytes), ESLint with zero errors,
  roadmap validation and `git diff --check`. The full unit suite for those
  bytes is the 2026-10-25 candidate run: 2,029 passed, 1 opt-in skip. A
  repeat full run on 2026-11-15 was stopped after the threads pool hung,
  with host load averages of 200–390 from other projects' builds. It had
  printed no failures (`unit.log`).

## Native identity

- On 2026-10-25 all four Taira validators received ELF `c1feaf0a…`, built
  from `f24908b` plus the captured `SOURCE_EFFECTIVE.patch` (SHA-256
  `76232ad9…`). The capture, revision record and verification are in
  `../bpng/png2-deploy/output/dashboard-native-integration-20261025/dashboard-budget-correction-20261025/capture-f24908b/`.
  Their hashes match the build handoff.
- The summary cache and history-budget corrections were later committed in
  canonical Iroha `004047600b` (2026-10-26). That commit was not compared
  byte for byte with the capture.
- On 2026-11-14 at 16:02 UTC, public Torii reported `a34b1e7a60`
  (2026-11-12) at height 12,991 with three peers. That revision contains
  `004047600b`, and its blocks collection still exposes `hash`, which the
  retained-window anchor selects.

## Public Explorer drift

A read-only check on 2026-11-14 at 16:02 UTC found that
`taira-explorer.sora.org` no longer serves release `20261025T114146Z`
(`public-verification-20261115.json`, `live-now/`):

- `index.html` was last modified on 2026-11-08 at 05:41:46 GMT. It now has
  SHA-256 `81d6af83…`, `SOURCE_REV` `a267f2423c4e728901f6a2f1cdccbe69319c277d`
  and `SOURCE_WORKTREE` `clean`.
- That revision is `origin/master`'s merge "Merge current explorer release
  and restore Taira transaction display" (EX-350, EX-353–EX-356). It merged
  `ff5b219` with the dashboard base `2021914`, so it predates this branch's
  2026-10-25 commits. During the 2026-11-14 check it was not reachable from
  this checkout or through the GitHub API; it was fetched later.
- The live build routes the same three dashboards. The Governance dashboard
  chunk is not a difference: `src/pages/GovernanceDashboard.vue` has been in
  this repository since 2026-06. An earlier version of this record said
  otherwise; that claim came from a faulty search.
- Its block projection omits `hash`, block windows read 64-row pages, and
  the retained block window is absent. Bounded collection scans read 100
  rows. The Explorer-side EX-359 changes are therefore not live, while the
  native changes are.
- 202 of the 206 published candidate files still return their original
  bytes, but the current `index.html` does not reference the old entry
  chunks.

On 2026-11-15 the owner chose to merge `origin/master` into this branch and
republish from it (EX-360).

## Republication

The merged release `20261114T231342Z` is live at
`https://taira-explorer.sora.org`. It was built from merge `8e006ad` and
recorded at HEAD `d0f6d4f`, which changes only `.claude/launch.json`; the
worktree was clean.

- **Publisher.** The maintained `png2-deploy poc web taira-explorer` path,
  on the approved OVH host only, with a dry run first (`publish.log`,
  `publish-dry-run.log`). The previous release `20261108T054146Z` is kept,
  so `poc rollback web taira-explorer` restores it. The keep-three policy
  pruned `20261025T114146Z`, whose source remains commit `8bd7692`.
- **Config.** The checked-in `png2-deploy` ledger still describes the
  2026-10-19 network (`E2EC52C5…#15D5`), so `poc web-config` would render a
  wrong NetworkId. The release uses the existing Taira config instead. Its
  NetworkId, `hash:4978D0BD…#6774`, equals the hash of Taira's genesis block
  as read from public Torii on 2026-11-15.
- **Public files.** All 202 checked files match the candidate byte for byte
  (`release-candidate.json`, `public-verification.json`), including
  `config.json`, `SOURCE_REV` and `SOURCE_WORKTREE`. All six checked routes
  serve the new `index.html`.
- **Before publication.** The exact `dist/` bundle was previewed locally,
  with `/v1`, `/status` and `/metrics` forwarded to public Taira and no
  mocked data. The homepage and all three dashboards rendered live data.
  Activity reused Network's 250-block window and read only the missing 750
  blocks: seven 100-row pages and one 50-row page.
- **After publication.** On the public site, Network read 250 blocks with
  none unreadable and 3 peers. Activity read 1,000 blocks and a
  500-transaction sample. Ledger read 16 domains, 4 asset definitions and a
  bounded 1,000-account sample. Every Torii read returned HTTP 200, with no
  alerts and no console errors.
- **Unit tests.** These had not run at publication. They passed
  afterwards on the same code; see the merge gates below.

`origin`'s development proxy allow-list covers none of the
`POST /v1/explorer/*/query` collection reads the SDK issues. It also lacks
`/status`, which the app still requests. `vite dev` therefore cannot load
the homepage or dashboards; production is unaffected, because it calls
Torii directly. (Resolved for the homepage and dashboards in EX-362 on
2026-11-25.)

## Merge with `origin/master`

This is the first release, so no backwards-compatibility code was kept.
The 33 conflicted files were resolved as follows:

- **Locales (25 files).** All take `origin`'s reviewed translations
  (EX-354). `origin` already had `definitionsByBalances`. All 26 locale
  files match `origin` and have exactly `en.json`'s keys.
- **`vite.config.mts`.** Takes `origin`'s single allow-listed `/v1` dev
  proxy; the old `/status`, `/metrics` and `/peers` proxies stay deleted.
  The keep-alive agent is kept.
- **`src/shared/api/index.ts`.** Takes `origin`'s import order. Block
  samples keep their canonical block hash type.
- **`Dataspaces.vue`.** Keeps `sortedRows[0]`. The rows are already
  filtered by catalog membership, so the second registered-lane lookup was
  redundant and is removed.
- **`ActivityDashboard.vue`.** Keeps the typed hour-coverage map.
- **`Econometrics.test.ts`.** Takes `origin`, which retired holder-snapshot
  persistence. This branch's storage-isolation stub and persistence test
  covered that removed code, so they are deleted.
- **`dashboard-api.test.ts`.** Keeps the block hash, in `origin`'s
  formatting. The projection-rejection row uses a canonical hash plus an
  unprojected field, so rejection can only come from the projection.
- **`Dataspaces.test.ts`.** Takes `origin`'s naming.
- **`ROADMAP.md`.** Starts from `origin`'s renumbered table. Base rows
  EX-311, EX-325, EX-326 and EX-327 became EX-333, EX-347, EX-348 and
  EX-349; they carry this branch's updates. This branch's new rows EX-328
  to EX-331 became EX-357 to EX-360. References in this branch's records
  and source comments were renumbered to match.

`origin` deleted `src/shared/lib/history-cache.ts` when it retired the
persisted-history fallbacks. The dashboard block window was its only
remaining consumer, so it now owns that privacy-scoped key function, with
its own tests. The window is shown as unreconciled until its tip matches a
fresh head read by hash, so it is not a fallback. The transaction-history
caches stay deleted. `origin`'s localized-copy check flagged that key's
template string, so it has an exact-value allowlist entry.

On the merged tree, these all pass (`output/closeout-20261115/merge/`):
SDK integrity, typecheck, ESLint with zero errors, roadmap validation (360
rows), the localized-copy check, the production build, bundle budgets
(startup 421,602 of 540,000 gzip bytes) and the diff check.

Unit tests could not start before publication: at host load averages of
about 300, every Vitest worker missed its fixed five-second start limit.
After the host restarted, the full suite ran on 2026-11-15 at `54ee99f`,
whose code is identical to merge `8e006ad` and published HEAD `d0f6d4f`.
It passed 2,114 tests in 183 files, with the one opt-in GPG integration test
skipped (`merge/unit-full.log`). That includes 35 block-window composable
tests, 13 retention and cache-key tests and 4 block-window cache tests.

## Final review

The original detached review output was lost when the earlier session's
temporary directory was cleared. A fresh independent review of the release
diff on 2026-11-15 found the following:

1. **Fixed after the release.** A smaller dashboard could drop a larger
   dashboard's unfinished window and its continuation. The cap was the
   current length, so one new block trimmed the window and cleared the
   cursor, and the return trip rescanned from the head. The retained window
   now carries the largest window size it is read for. The cap is the
   current length or that size plus the 512-row headroom, whichever is
   larger; it is bounded because the window sizes are bounded. Two
   regression tests cover the unfinished round trip and the cap. All 35
   block-window composable tests pass (`focused-fix.log`), as do the 6
   retention and 8 dashboard tests that use it. Typecheck, production
   build, bundle budgets (startup 472,983 gzip bytes) and roadmap validation
   pass on the final tree, and ESLint passes on the changed files. The block-window cache tests were not
   re-run: Vitest's fixed five-second worker start limit kept failing under
   the host load, and that file is unchanged since its 2026-10-25 run. For
   the same reason the full suite was not repeated on the final tree. The
   fix is commit `e767703`. It first shipped in the merged release
   `20261114T231342Z`, whose candidate was built from merge `8e006ad`, which contains it
   (`merge/release-candidate.json`; see Republication). An earlier version
   of this record said it was not deployed (corrected 2026-11-25).
2. **Not reachable.** Torii rejects a continuation whose snapshot hash no
   longer matches the chain (`InvalidSnapshot`). After a same-genesis reset,
   an older-page read therefore fails visibly instead of mixing two chains.
3. **Accepted.** Leaving a dashboard while a page is in flight can request
   that page twice, because the earlier generation's request is not aborted.
   This costs one extra read and does not affect correctness.
4. **Accepted.** Expired windows stored under other Torii endpoints are
   ignored but not removed. Each endpoint keeps one overwritten entry of up
   to about 2,512 rows.

## EX-348

EX-348 remains blocked. Current Torii history cursors bind a snapshot height
and hash internally, but an initial request cannot name a shared snapshot.
Independent first pages therefore cannot be pinned to one snapshot and
reader visibility, and parallel height ranges could combine inconsistent
views. Further acceleration is not warranted now:

- After the delivered changes, the default cold-browser medians are
  4.1–6.7 s.
- A return visit within 30 minutes needs only a head read.
- A cold 1,000-block feed takes ten sequential 100-row pages, about 4.7 s.
- An upstream snapshot-start contract would need a new Torii API and another
  validator rollout.
- The Explorer-side EX-359 changes have been live again since release `20261114T231342Z` (EX-360).
