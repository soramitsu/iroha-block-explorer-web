# Dashboard performance closeout — 2026-11-15

This record closes the source and evidence trail for EX-325 and EX-327–330.
It follows the [rollout record](taira-dashboard-rollout-2026-10-25.md) and
the [implementation report](dashboard-performance-2026-10-25.md). No
feature was rebuilt, and no validator or public site was changed. Evidence
is retained in `output/closeout-20261115/`.

## Release source

- Explorer release `20261025T114146Z` was built from `9dc6e97` plus an
  uncommitted working tree. That source is now commit `8bd7692`. All 22
  source and implementation-report files match the frozen candidate's
  per-file SHA-256 record (`output/taira-dashboard-deploy-20261025/explorer-candidate.json`).
  The EX-311 OVH staging note from 2026-10-28 belongs to separate work and
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
- That revision was not found in this repository, its GitHub origin, the
  sibling repositories, or the local deploy records and session transcripts
  searched.
- The live build still routes `/dashboards/{network,activity,ledger}` and
  adds a Governance dashboard chunk that this repository does not contain.
- Its block projection omits `hash`, block windows read 64-row pages, and
  the retained block window is absent. Bounded collection scans read 100
  rows. The Explorer-side EX-330 changes are therefore not live, while the
  native changes are.
- 202 of the 206 published candidate files still return their original
  bytes, but the current `index.html` does not reference the old entry
  chunks.

This repository did not publish the 2026-11-08 build. Restoring
`20261025T114146Z` or a successor would replace another release, so it
needs the owner's decision. That decision is tracked as EX-331.

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
   the same reason the full suite was not repeated on the final tree. This
   change is not deployed.
2. **Not reachable.** Torii rejects a continuation whose snapshot hash no
   longer matches the chain (`InvalidSnapshot`). After a same-genesis reset,
   an older-page read therefore fails visibly instead of mixing two chains.
3. **Accepted.** Leaving a dashboard while a page is in flight can request
   that page twice, because the earlier generation's request is not aborted.
   This costs one extra read and does not affect correctness.
4. **Accepted.** Expired windows stored under other Torii endpoints are
   ignored but not removed. Each endpoint keeps one overwritten entry of up
   to about 2,512 rows.

## EX-326

EX-326 remains blocked. Current Torii history cursors bind a snapshot height
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
- The Explorer-side EX-330 changes are not currently live (EX-331).
