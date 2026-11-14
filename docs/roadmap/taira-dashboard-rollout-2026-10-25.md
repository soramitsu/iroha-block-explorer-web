# Taira dashboard rollout — 2026-10-25

Deployment and live validation completed on 2026-10-25. All four Taira validators
run corrected native build `20261025T110301Z`, source
`f24908b4b31998f63aeb7a6e7a1cabcad2267a8b`, ELF
`c1feaf0adcc653abd976808a49b6dbaff4f347f64a2d90664af7d9a8e6b889f1`.
[The public Explorer](https://taira-explorer.sora.org) runs release
`20261025T114146Z`. Public primary is physical seat 1; all four Core APIs retained
release `20261025T074159Z` and their post-adoption processes under generation
`b61314f9e9e1fbaa4591629cbae63f8186b0434568a450f89acff8b736d774d9`.
The existing chain, databases and network identity were preserved.

All **14 fresh-browser trials passed**, with zero HTTP errors, browser errors,
error banners, unfinished finite requests or unreadable sampled blocks. The
three default trials per dashboard completed their configured samples; separate
trials covered Network windows 100/500/1,000 and Activity windows 500/2,000.
Representative screenshots were also reviewed for visible chart coverage and
consistent sample denominators.

| Dashboard | Before completion | After median (3/3 complete) | Observed reduction |
| --- | ---: | ---: | ---: |
| Network, 250 blocks | 5.083 s median, 3/3 | 4.126 s | 18.8% |
| Activity, 1,000 blocks + 500 transactions | 12.794 s, one success out of three | 6.724 s | 47.4% versus that successful run |
| Ledger, bounded collection samples | 8.504 s median, 3/3 | 6.348 s | 25.4% |

Activity's two baseline HTTP 500 failures remain in the record. The largest
Activity window completed 2,000 blocks in 10.618 seconds. These are cold
**browser** contexts with empty cookies, storage and HTTP cache. Browser-process,
OS and Torii caches may be warm. Baseline UI was `explorer-bpng.soramitsu.io`;
the deployed UI is `taira-explorer.sora.org`, both using the same public Torii.
These are observed end-to-end comparisons, not a controlled attribution of all
improvement to either the server or frontend.

Public Torii SDK scans returned contiguous, unique heights with matching
baseline-overlap hashes: 1,000 blocks in 16 pages/6.400 seconds at page size 64
(before 10.895), 1,000 in 10 pages/4.680 seconds at size 100 (before 8.400), and
2,000 in 20 pages/8.975 seconds. All completed without errors. The first, rejected
native candidate's genuine HTTP 500 is retained separately, not excluded as a
probe failure.

All 206 public artifact files match the frozen build and source markers; all
five checked routes return the expected HTML. Six initial bulk-read timeouts
passed a sequential retry and remain recorded. Final readiness passed for all
four Core services and KYC. Authenticated resource-name reads returned HTTP 200
and Norito on all four native validators. The selected new native process served
historical proof 4,112 in 30.403 seconds and 4,113 in 0.732 seconds after its
verified-prefix cache was populated. This history cost is separate from the
Explorer block-feed timings. The MiBank staff login, identity/device selection
and offline-exchanges read passed without monetary or enrollment writes; exact
release and generation matched before and after. A final sequential public
`/readyz` read on ports 9441–9444 returned HTTP 200 on all four, including 9441.

The native name/history probes validate response transport and expected format;
they do not independently verify the returned cryptographic proofs. Core's
successful production q3 startup preceded the corrected validator rollout. No
fresh post-rollout q3 collector result is claimed. Dashboard completion is
supported by the actual public SDK scans and browser observations above.

Evidence:

- `output/playwright/taira-deploy-20261025/saved-evidence-report.final.json` and
  `.md`: all before/after measurements, original failures, coverage and hashes.
- `output/taira-dashboard-deploy-20261025/public-verification.json` and
  `public-verification.initial.json`: public file and route checks with retries.
- `../bpng/png2-deploy/output/dashboard-budget-correction-authority-20261025/native-transition-20261025T111920Z-70206/final-handoff.json`:
  exact running images, process identities, Strict startup receipts and primary.
- `final-public-names.jsonl`, `final-selected-history.json` and
  `final-native-public-readyz.json` in that same
  operation directory: final native read checks, with their validation scope.
- `../bpng/png2-deploy/output/recovery-takeover-20261025/public-readiness-20261025T115541Z.json`
  and `dashboard-final-staff-smoke.json`: final public API checks.

Frontend validation passed 2,029 tests (one opt-in skip), typecheck, production
build, lint, SDK integrity and bundle limits. The corrected upstream changes
passed seven focused Core and 17 Torii tests, followed by the canonical production
release build and the live checks above. Independent parallel history starts
remain deferred under EX-326 because the API lacks a shared snapshot/visibility
selector. No further deployment action is pending.

The sections below retain the chronological preparation and recovery history.
This record follows the [local implementation report](dashboard-performance-2026-10-25.md).

## Observed starting state

- Public Torii reports source `2864406860a93334da59d2c9d856e967857446ea`,
  `x86_64-unknown-linux-gnu`, three peers and height 4,112.
- The live validator artifact also contains the later recovery patch
  `65b2e00a`; its complete source capture, rather than the status revision alone,
  is needed to preserve those fixes.
- The authoritative network is
  `hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774`,
  prefix 369, with forced direct reads from `https://taira.sora.org`.
- `taira-explorer.sora.org` is a distinct deployment from
  `explorer-bpng.soramitsu.io`. Its active release is
  `20261022T090340Z-qr31-20261022-8786c5b0`, under
  `/srv/taira-public-sites/explorer`. It renders **Page not found** for
  `/dashboards/network`; the existing dashboard build is on the BPNG hostname.
- Taira and BPNG public HTML hashes differ. Both configurations select the same
  network. Initial public response snapshots are retained under
  `output/playwright/taira-deploy-20261025/`.

## Prepared changes

The Explorer now requests 100-row block pages while following the opaque cursor
chain. A short page with new rows continues towards the selected window; five
consecutive pages without new rows stop the scan. Regression coverage includes
67 short pages filling a 200-block window. The full frontend suite passes 2,029
tests, with one existing opt-in skip. A test-fixture type annotation was then
corrected; all 33 composable tests and typecheck pass on that final fixture.
Production build, lint, SDK integrity, roadmap and bundle checks pass; startup
is 472,985 of 540,000 gzip bytes. The frozen candidate contains 205 files and
the freshly rendered current network configuration. Its file hashes and source
snapshot are in `output/taira-dashboard-deploy-20261025/explorer-candidate.json`.

Concurrent independent height ranges remain blocked under EX-326. Initial
requests cannot share a snapshot and reader-visibility binding through the
current API. Height seeking alone does not establish that binding.

The maintained `png2-deploy` publisher now supports `poc web taira-explorer` and
its matching rollback command. It uses the existing Taira release directory and
atomic `current` link, preserves the exact previous release, and keeps BPNG's
separate publication target. Focused web dry-run checks and all 21 local
staging/snapshot tests pass. This static publication does not need an nginx
reload. Its configuration was rendered from the current reset ledger using
`poc web-config`.

## Native coordination and measurement

The user explicitly authorized coordination with **Finish deploy and restore
BPNG** and **Speed up BPNG node restarts**. Their checkpoint export and Core
adoption retain the live lifecycle window until they release it. Heavy cold
dashboard reads and validator changes are deferred during that window.

Canonical Iroha contains unrelated retained-attestation work with unresolved
review findings. The source review must preserve live recovery fixes and avoid
activating that work. Any source transformation must be bounded, recorded in
the maintained canonical capture, and bound into build provenance. Canonical
working files must remain intact. The prepared capture helper passes 31 tests
and independent review, including immutable completion, resume and export
bindings. A full 26,935-file exercise preserves live recovery code
and transforms exactly 23 paths; its replayable effective diff is
`2ef94c79aaf5b86bd2033a2104339eeb862546be052d6316e07ee41522baaba9`.
That exercise predates the emergency admission fix and is not the final build
input. The recovery owner has opened a narrow editing window for the reviewed
controller build/export/resume hook. Its guarded application is complete;
31 helper tests, seven hook tests (including 24 existing plain Core resume
cases), shell syntax and diff checks pass. The exact command and source pins
were handed to the recovery owner in the emergency candidate's `READY.json`.
The emergency build will contain only the frozen admission fix and
the exact retained-attestation exclusion. Dashboard features will follow after
recovery releases the lifecycle window. No canonical source edits or alternate
checkout builds are used by this capture path.
Details are retained in
`../bpng/png2-deploy/output/dashboard-native-integration-20261025/`.

After the native artifact is built, its changed executable identity and source
revision require a signed server-generation transition and coordinated Core
adoption. The rollout will preserve the existing chain and keep exact rollback
artifacts.

The existing Core operation subsequently encountered startup read deadlines,
so the recovery owner continues to hold the live window. No performance
rollout or heavy measurement has begun. The recovery owner is preserving its
measured validator CPU allowance changes in the existing unit files; the
dashboard rollout must preserve those controls and the updater's existing
no-drop-ins boundary.

Emergency build `20261025T081946Z` compiled successfully in 10 minutes 7 seconds
and was exported with binary SHA256
`ed67ca6714edcb771360cbe81efb735b004cbeb8d268816917b9e31007ccbcc7`.
It contains no dashboard features. The recovery owner is applying its combined
Core/native transition. Validator main-unit CPU quotas are 300% on physical
seats 1, 2 and 4, and 200% on seat 3. Subsequent builds use
`TMPDIR=/private/tmp` because the capture helper intentionally rejects the
symlink component in macOS's default `/var/folders` temporary path.

The offline dashboard successor preserves the emergency production fix and has
passed an independent source-collision review. Its final capture is waiting for
the recovery team's authenticated-genesis test-fixture migration to freeze.
Unrelated Petal work stays in the canonical checkout and is excluded only from
the captured deployment input. No dashboard build or public activation has
occurred at that point.

Recovery subsequently completed operation `20261025T084225Z-fatwp8g3` and
explicitly handed over measurement and deployment ownership. All four Core
processes select signed generation
`bacff299fb81ec2b7972bf92a258eccce3a7abd8b8cacee8fe388c7319da31b8`
with checkpoint 4,112. All four validators run the emergency image above;
the proof-route drain is removed and the public primary is physical seat 1.

The baseline was measured after that recovery and before the dashboard build:

| Cold browser route | Successful runs | Complete-window time | Failure |
| --- | --- | --- | --- |
| Network, 250 blocks | 3 / 3 | median 5.083 s | None |
| Activity, 1,000 blocks and 500 transactions | 1 / 3 | 12.794 s for the successful run | Two HTTP 500 block queries, at 896 and 257 retained rows |
| Ledger, bounded collections | 3 / 3 | median 8.504 s | None |

Direct SDK reads of 1,000 contiguous blocks completed in 10.895 s with 64-row
pages and 8.400 s with 100-row pages. Browser evidence and the two excluded
instrumentation-calibration runs are recorded in
`output/playwright/taira-deploy-20261025/baseline-summary.json`.
Normal cancelled refresh requests are retained separately from application
errors. Unavailable optional CDP response bodies cannot prove collection
exhaustion. The final harness has 34 passing local checks.

Dashboard native build `20261025T091203Z` passed release compilation in
10 minutes 36 seconds through the maintained six-job warm lane. Exported ELF
SHA256 is `166e09f4565065d846c312ea7d71c379f63792f191298e434828385779bdc06e`
(546,310,688 bytes). The executable and all source records pass local hash
verification. Its exact effective source is
`23cb95791c53053eb48e0dab495b63655707960361c5cf0afb7d9a994931dfe5`,
tree `e28c84c5a6f28cb020679aa8f2de8b598d0b16b1c01b3bdc1bdb21f78f5036e7`.
The final capture also excludes one unrelated Petal CLI file, with the complete
reviewed output unchanged. The retained-authority rollout wrapper passes ten
flow tests and 20 guard tests and independent review. Its first read-only guard
initially rejected maintained Core storage dependency drop-ins; exact per-role
path/content bindings corrected that assumption, preserving missing/extra/changed
file refusal. No live service changed before that correction. It requires the existing
signed native identity, preserves Core processes, and stops after each accepted
validator. The staged native rollout has started; no Explorer publication has
occurred yet.

Prepared rolling operation `20261025T093205Z-y_b14n6a` verified all four old
`ed67ca67…` and new `166e09f4…` images. Source, node, build and configuration
native identities match the already signed authority, so the transition uses
retained authority and preserves all four Core PIDs. The prepared directory is
`../bpng/png2-deploy/output/dashboard-native-integration-20261025/dashboard-retained-rollout-20261025/runs/dashboard-retained-20261025T092536Z-79461/prepared`.

Cold-load measurement uses fresh browser contexts with empty storage and no
response mocks. It records mount time, complete-window time, visible errors,
HTTP responses and browser errors. The harness waits for final collection
coverage, status completion and finite requests to drain; a rendered heading
alone does not pass. It covers all four Network windows and all three Activity
windows up to 2,000 blocks. Local mocked harness validation passes 15 browser
scenarios, 14 argument-validation cases and five CLI-result cases. These are
harness checks, not live dashboard results. Browser storage and HTTP caches
are cold; shared browser-process, operating-system and Torii caches may be warm.
The previous dashboard build on BPNG is the
UI comparison baseline because the Taira hostname currently lacks dashboards.
Native query measurements use the same public Torii origin before and after.
No speedup or live completion is claimed until those measurements pass.

The first physical validator was accepted at tip 4,142 in operation
`20261025T093205Z-y_b14n6a`. Its current-process Strict replay receipt and fresh
native attestation bind candidate PID 3210511 and invocation
`9d88e2ff713a4eaeb2984f65cbbb9886`. Core processes, signed generation and
resource controls remained unchanged. Verification initially stopped on
transient historical proof reads at different heights before requesting an
attestation. The maintained verifier now uses the same five-attempt bounded
proof-read retry as its existing collection path; 13 focused tests cover
recovery, exhaustion without a receipt, immediate budget refusal, and the
original deadline. Cryptographic verification and acceptance checks are
unchanged. The candidate was not restarted during those retries.

Seat 2 encountered a survivor-quorum read failure after stopping and before
installing the candidate. The original handler did not retain the failed route
or transport diagnostic, so no specific HTTP status or timeout is inferred.
A bounded observation confirmed the exact original launcher, inactive PID 0,
unchanged configuration, and three healthy survivors at height 4,142.
The updater lacked recovery for that pre-start boundary. Its maintained
`recover` command now validates the exact current seat and accepted prefix,
old launcher and binary custody, stopped cgroup, surviving quorum and Core,
then rechecks custody before installing the prepared image and recording the
durable start boundary. Nineteen focused controller tests and two wrapper tests
pass, with independent review. Seat 2 resumed through that command and passed
Strict replay on PID 3215990, invocation `96830755963e4be7a1146a1672d1afc1`.
No ledger restoration, manual phase change or Core restart occurred.

The next seat's first parallel historical-proof batch exhausted five 45-second
client reads without a response. Short diagnostics also stalled on an unchanged
validator, and exact source comparison found the historical finality path
unchanged between the old and dashboard images. State-view contention logs
were not evidence of a permanent lock: the long-held-view warning is emitted
when that view is dropped. An isolated direct request to updated seat 2 for
proof 4,113, with a 75-second client allowance covering the existing 65-second
server deadline, returned HTTP 200 and 22,502 Norito bytes in 30.265 seconds.
This supports cold-prefix contention rather than a persistent endpoint failure.
The process-local cache starts empty after restart; a high historical request
can scan from genesis and only retains a checkpoint after full verification
and source validation. Four concurrent first reads can repeat that work.
One ordinary isolated prefix read on the public node prepares the cache before
retrying the unchanged fresh-proof verifier. No cached attestation, proof check
bypass, native code change or server-cold performance claim is involved.

The isolated primary-node prefix read returned the same proof bytes in
30.462 seconds. A subsequent attempt collected every historical proof but
encountered an attestation race: the chain advanced from 4,142 to 4,143, and the
server returned the legitimate `TipChanged` HTTP 503 in 0.545 seconds. This
response did not justify increasing the verifier timeout. A fresh invocation
at the current tip completed without changing the verifier: all 30 historical
proofs, fresh challenge/attestation, native cryptographic verification, and
current-process Strict receipt passed. Seat 2 was accepted at height 4,143
in 83.343 seconds, with the same candidate PID and unchanged Core/generation
controls. The remaining seats then continued sequentially.

## First candidate live-query rejection

All four native validators accepted image `166e09f4…`, preserving the original
Core PIDs and generation. The first genuine SDK read then failed: a 64-row
request sequence targeting 1,000 blocks returned only 77 blocks across 26 pages
of 1–4 rows, then HTTP 500 at the next height, 4,066. Total elapsed time was
6.252 seconds. This failed result is retained in
`output/playwright/taira-deploy-20261025/after-first-64-query.json`; it is not
excluded as instrumentation or reported as a successful after measurement.
Explorer has not been published.

The server logged `ERR_DECODE_RESOURCE_LIMIT` during runtime manifest decoding,
then a caught panic in `State::view`: the persisted runtime projection appeared
invalid because the request's decode budget had already been spent. The new
canonical-history helper was unnecessarily acquiring the entire World/runtime
view inside the per-row bounded decoder. Separately, successful short pages
prevented the existing adaptive middleware from trying a larger owner after a
real capacity refusal. The corrections retain canonical source validation,
output reservations, typed capacity refusals and valid continuation at the
maximum owner; they remove the unrelated full runtime projection and allow the
existing owner-growth mechanism to recognize successful partial pages.

Public readiness observed at 10:47:11 UTC remained healthy for all four Core
services and KYC, including Kasumi and operator-auth readiness. This is local
configuration/storage readiness, not a claim that all ledger reads passed.
The maintained updater has no completed-operation single-seat rollback command.
A corrected forward rollout is being prepared. Canonical HEAD advanced to
`d21869c753eb2ed2150e3e680b209a4866538587`, a five-file SDK commit. The next
build uses current canonical source and records its actual identity.

The reviewed corrections were integrated into the canonical checkout with
byte-for-byte inverse verification preserving every original preimage. Canonical
HEAD then advanced to `f24908b4b31998f63aeb7a6e7a1cabcad2267a8b`; the maintained
build captured that actual current source once, retaining concurrent committed
work and applying the existing reviewed exclusions only inside the build capture.
Focused component regressions passed: seven Core and 17 Torii tests. These ran
in the already active component-test lane; subsequent source and release work
uses the canonical checkout. The production release built from current captured
source in 10 minutes 34 seconds and exported verified ELF
`c1feaf0adcc653abd976808a49b6dbaff4f347f64a2d90664af7d9a8e6b889f1`
(546,281,200 bytes), build `20261025T110301Z`. An independent review confirmed
the original startup, root-scope, finality and ABI checks remain unchanged.

The new source revision changes the signed native build identity, so the existing
retained generation cannot authorize it. The established new-authority workflow
preserves Core release `20261025T074159Z`, its exact binary, checkpoint 4,112 and
all databases. It requires one sequential identity adoption per Core role;
there is no supported same-process reload. The user's earlier authorization for
the fastest sequential rollout covers these necessary brief restarts. No
current-only retirement or second Core restart is planned. The first corrected
validator must complete a genuine 1,000-block SDK read before the other three
are updated. This live result and public Explorer publication remain pending.

During identity adoption, BPNG startup and its automatic rollback both failed
at the 12-second current-asset history deadline. Core selects the highest-height
signed direct validator, using the last signed URL on ties; all four were at
4,143, so the selected route was port 9444 (physical seat 2). Its process-local
verified prefix cache was cold. A bounded 75-second read verified prefix 4,112
in 30.301 seconds; the following proof completed in under a second. BPNG then
started successfully on the prepared b613 generation, retaining the exact
074159 binary and all data. This avoided a redundant old-generation start.
The remaining three Core roles are being adopted sequentially; no corrected
validator has started yet. The initial failure remains recorded, and readiness
checks from before this interruption are not treated as current evidence.

All four Core roles adopted generation b613 and passed local/public readiness.
The first corrected validator step stopped before installation when a surviving
validator status read failed; the exact transport cause was not retained in the
terse controller error. The maintained guarded recovery resumed only that seat.
Its process completed Strict replay and a real direct SDK read returned all
1,000 contiguous blocks (4,143–3,144) in 16 pages and 6.205 seconds, with no
errors. All 994 overlapping baseline-union hashes matched. This direct-port
canary is separate from the final public-route/browser comparison.

Physical seat 1 was routed publicly and accepted without another restart.
Explorer release `20261025T114146Z` was then published atomically to
`https://taira-explorer.sora.org`; the previous release is retained for rollback.
The other three validators are being updated sequentially before final
fresh-browser performance measurements.
