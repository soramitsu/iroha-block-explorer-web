# Taira canonical SDK integration — 2026-09-12

The public data, layout, transport and canonical SDK startup repairs are deployed
as operator release `20260912T124538Z-sdk-b9abdfd69fe6-operator`. The SDK signature
and source evidence are verified. Signed application release qualification remains
open under EX-305; the operator release does not claim it. Public static
compression is deployed and verified under EX-310. The sections below retain the
chronological validation and publication evidence.

A fresh public HTTP continuity check at 10:19 UTC confirmed the layout release remains
`20260912T064954Z-layout-f6c27bbda414-operator`; configuration, release metadata,
blocks and latest transactions returned HTTP 200. Both data reads used snapshot
height 1146, advancing from 1078 at 08:48 UTC. Both return the current 204-character
cursor and allow the exact public Explorer origin through CORS. The config is
byte-identical to the deployed three-field profile. The curated MCP block and
transaction reads also returned HTTP 200 at height 1145 just before this sample.
This proves public read continuity only, not browser or four-validator health.
Evidence is in
`output/taira-sdk-integration-20260912/public-read-verified-2026-09-12T10-19-44.119174+00-00.json`.

## Reviewed preparation

The startup candidate validates runtime configuration before downloading the
codec, dynamically imports the SDK-owned browser codec, and awaits its required
zero-argument initializer before importing API consumers. Module loading and
initialization failures use a fixed-text error with explicit retry. Concurrent
retry clicks cannot start duplicate bootstraps or mounts; a downstream failure
does not repeat successful codec initialization.

The two-file patch in `output/taira-sdk-integration-20260912/` has SHA-256
`26546a86943ce22e41e31e7cf48f333dcd767d319c791ffb5df0b84d0b9e42e5`.
Its 16 Vitest and seven control-flow checks pass on Node 24.19.0 / pnpm 10.11.0,
with scoped lint and a static import-graph audit. These tests use synthetic codec
dependencies; they are not evidence that a real Wasm release works in browsers.

The SDK admission candidate in `output/taira-sdk-admission-20260912/` has patch
SHA-256 `28bc17db424b998055b4867b6da76f03461b2f99d138c28ffde064cb72b0e7fc`.
Its 53 tests pass on the same pinned toolchain. It consumes the original BPNG
verifier's opaque same-process authority, independently pinned native source and
whole pnpm lock, exact installed archive bytes, authenticated SDK dist inventory,
and one byte-identical SDK-owned Wasm in the application output. Copied claims,
changed or missing evidence, package tampering, alternate module attributes and
artifact substitution fail admission.

The reviewed helper is now integrated under deployment ownership at
`../bpng/png2-deploy/scripts/lib/taira-app-explorer-sdk.mjs`, with its 53 checks
ported to the deployment repository's native Node test suite. The tests use an
owned pnpm fixture and require no Explorer checkout. This keeps mandatory sibling
deployment imports out of standalone Explorer unit tests. The original verifier
is unchanged; no copied verifier, silent test skip or alternative release
authority was introduced. The original patch and controller review remain
available as preparation evidence.

The dedicated BPNG Explorer build controller is implemented in
`../bpng/png2-deploy/scripts/run-online-explorer-release-build.mjs`. Its initial
41 native Node checks passed. It authenticates source and SDK evidence with the existing
verifiers, installs from a pinned offline pnpm store with lifecycle scripts and
pnpm hooks disabled, admits the installed SDK before application execution, and
checks source, controller, dependency and tool inventories before and after the
build. That initial controller SHA-256 was
`692ff9aaf581c4e50398c9f8ceae7e3b135c3794bcbf5ba0ab311947a38b8713`;
the retained full-suite log and receipt are in
`../bpng/png2-deploy/output/online-explorer-controller-20260912/`.
Its result is explicitly unsigned local build evidence. A real invocation
still requires the qualified SDK and composed Explorer source.

The controller now additionally retains its original Git base commit, reviewed
source inventory, all fourteen SDK evidence inputs, raw signatures, command
records and raw process output, generated configurations and artifact inventory.
The portable deployment-owned verifier requires an independently supplied
original receipt digest, reauthenticates the original SDK evidence and compares
all admitted artifact bytes. Its opaque handle retains defensive buffer copies
for host rendering. This closes the local evidence retention and verification
work; central signed host integration is now complete under EX-306 as recorded below.

Initial retention checks passed on Node 24.19.0: 53 controller tests, 77 portable admission
tests, and the existing 53 SDK admission tests, all with zero skips. The portable
module also imports from seven isolated deployment library files without sibling
repositories. Evidence paths require exclusive creation and bounded reads;
external symlinks, preexisting directories and oversized or unreviewed evidence
are rejected. The current controller SHA-256 is
`2df61cc1188812d2dd9ee9a3575a5b4b7b9cc7852ad3e053469485b1611ca946`;
the initial portable verifier SHA-256 was
`27707255feb7a4e9d0962831c0787759d6d086377932ff09810725846a60dfcd`.
Source digests, final logs and limitations are retained in
`../bpng/png2-deploy/output/online-explorer-provenance-20260912/`.
These are synthetic controller tests, not execution of a qualified SDK release.

Central integration review found that portable source admission also needed a
direct check between the inventoried vendored SDK and its authenticated package.
The verifier now requires the exact `vendor/<signed filename>` file with matching
SHA-256 and byte count. The expanded 80-test portable suite rejects missing,
altered-digest and altered-size vendor entries even after every unsigned source
and receipt hash is recalculated. The controller's 53 tests and isolated portable
import check also pass after this change. The current verifier SHA-256 is
`071197210187d5394b84c0cbc07098767f7ec670e16cc76c6cdba56cd1aee42e`.
The previous logs and receipt are preserved; follow-up evidence is recorded
separately in the same output directory.

The test-only `taira-app-online-explorer-admission-fixture.mjs` now accepts the
central signed runtime and shared SDK without replacing contract, consensus or
staff bindings. Its four tests pass with both portal fixtures using that same
runtime and SDK; changed runtime/native context and SDK trust are rejected.
The 137 follow-up checks and source digests are recorded in
`../bpng/png2-deploy/output/online-explorer-provenance-20260912/vendor-binding-receipt.json`.
No build commands run in this adapter.

Central host integration is now complete and frozen. Provenance v3 and host
manifest v4 bind all three original build identities; signing and rendering use
the admitted artifact buffers, with exact portable verification on the host.
All three apps must share the canonical SDK attestation and signing key.
Original evidence remains outside the webroots: 40 files per portal and 69 for
Explorer. Substitution tests cover changed Explorer dist, source, SDK, missing
receipt, all five identity fields and mismatched cross-application SDK identity.

The central packet records 46 passing admission/substitution checks and 27
passing renderer/launcher checks, including an immutable temporary local bundle
apply. Supporting validation includes 63 host/activation/ingress checks, one
dependency-closure check and 24 portal-controller checks. Explorer independently
matched all 27 frozen source pins, five test logs and both linked evidence
digests against the central receipt at
`../bpng/png2-deploy/output/online-application-build-admission-20260912/receipt.json`,
SHA-256 `2a4f389225f37995ce162dfd87329cfcb8ed7d2e484a200d09146554526c008d`.
The verification record is
`output/taira-sdk-integration-20260912/central-admission-handoff.json`.
This completes the code integration in EX-306. All executed fixtures remain
synthetic; no actual SDK build, browser qualification, production signature or
deployment is established by this packet.

The browser candidate in `output/taira-sdk-browser-20260912/` has patch SHA-256
`1194de9b34367b812adaeca3928ed76db24e85f1c5b85b950887f73091b44f02`.
Twelve Chromium-pin/configuration checks, strict TypeScript and scoped lint pass;
Playwright discovers five dedicated startup cases. These require real production
modules and the exact authenticated owner Wasm, with configuration and Wasm
barriers, failure/retry, invalid-profile rejection and the deployment CSP. None
has been executed against a qualified SDK yet. The recorded discovery-only pins
are preparation inputs and must not be used for a release run.

A bounded review of the current SDK source graph found no concrete eager codec
call or browser-selector mismatch. The broad manual SDK chunk may load more code
than the small codec source graph, but the inspected factories defer binding
access. No speculative chunk change was added. Source hashes and limitations are
in `output/taira-sdk-browser-20260912/chunk-graph-review.md`; the real production
browser gate remains required.

Actual test discovery also found three retained startup suites under `output/`.
The maintained Vitest configuration now excludes generated output while retaining
Vitest's default exclusions. Discovery contains the original 161 maintained test
files and no output suites. Seventeen focused tests, typecheck and scoped lint
pass after this configuration change; the broader data/layout validation is
recorded separately. Configuration paths now use native ESM `import.meta.url`
instead of the bundled loader's injected `__dirname`. The actual native-loader
production build, three configuration tests and bundle budgets pass. This lets
the isolated controller put Vite's temporary cache outside verified dependencies
without excluding cache paths from its integrity checks.

## Required network context

The native SDK owner confirmed that instruction codecs now require an explicit
numeric network prefix. Taira's selected prefix is **369**. BPNG now requires
explicit `networkPrefix` in its signed online profile and `ledger.networkPrefix`
in its runtime manifest. The application-host renderer
projects that value into the required Explorer `networkPrefix` field. This
coordinated source change passes 51 runtime and rendering checks, recorded in
`../bpng/png2-deploy/output/online-network-prefix-20260912/receipt.json`.
The qualified Explorer configuration will therefore contain exactly
`toriiBaseUrl`, `toriiForceBaseUrl`, `networkId`, and `networkPrefix`.

The independent public native-codec receipt at
`../dpn/.underwriting-test-lane/api-a9f52d2/evidence/api14-public-native-codec-01/receipt.json`
contains `network_prefix: 369` and has SHA-256
`01dd7ccccc6924bfa9aba8f7a14dee6494ca61b60e2223bd7e75a78845e57d0a`.
The prefix is not derived from a NetworkId hash, account text or default.

Explorer's affected codec call is the nested multisig instruction decoder in
`src/shared/lib/multisig-custom.ts`. Its selected prefix must be passed explicitly
through instruction presentation, including nested proposals. The corresponding
runtime, presentation, tests and operator validation changes are prepared in
`output/taira-network-prefix-20260912/`. Every loaded profile now requires its
selected numeric prefix; the Taira and BPNG profiles require exactly 369. Missing
configuration or prefix fails before consumers are imported, and the loader reads
one configured location. The instruction presentation path passes the selected
prefix through nested multisig proposals with a bounded recursion depth. Updated
browser fixtures supply a valid explicit profile.

The candidate passes 203 focused tests, 42 operator-configuration checks,
application and browser-fixture typechecking, and scoped lint. Application
typechecking uses an isolated declaration of the successor decoder signature;
that declaration is excluded from the patch and does not prove actual qualified
SDK type compatibility. The deployed three-field profile is unchanged until the
qualified SDK and four-field application-host projection are ready together.

The final prefix patch has SHA-256
`e84621a2fec7bb5b755f1cd25808b6b5e213cfd3362fc92c29f27e9766814c76`.
Its new bootstrap negatives overlap the original startup patch, so an explicit
`startup-on-network-prefix.patch` preserves those cases and the reviewed codec
startup behavior. That patch has SHA-256
`8675ce482f7af6d484928974419ee9bbbcca0e9f5eaa3ce295bf8c0abc74e239`;
all 19 composed startup tests and scoped lint pass. Applying the prefix patch,
this adapted startup patch and the browser patch in that order produces all 27
reviewed candidate files byte-for-byte. The original startup patch is retained
as preparation history and must not be applied again in this composition.

A fresh check against the current dirty checkout at 10:17 UTC reconfirmed all
three patch digests and all 27 composed file hashes. All six maintained startup,
Vite, package, lock and SDK pins still match the previous review; the check did
not modify source or execute an SDK. Its record is
`output/taira-sdk-integration-20260912/composition-revalidation-2026-09-12T10-17-13-680Z.json`.

## Actual canonical SDK consumer validation

The native owner has now admitted the canonical package for application consumer
validation. Its packet is `browser-codec106/consumer-packet.json`, SHA-256
`77c192383c9c7ba89c31ed3c7533a4afdff6cfd6de27da5592d4764de258b7e5`,
under `/Users/takemiyamakoto/.taira-test-runtime-20260911/`. The package has
SHA-256 `136bc4725a6c78bc1a7596ebd620a8888d19f0547ae8dce21a280c6cf8baf684`.
All 200 archive members and all 200 installed files were independently matched.
The owner records 79 passing real Chrome checks. The SDK-owned Wasm is unchanged,
36,931,654 bytes, SHA-256
`fbc434ef49154351478b49524e44e0f2f08b71ce38be4912ec4e73ff546863eb`.
No native addon is installed or built on this Mac.

The three reviewed patches were composed and all 27 prepared source hashes
verified in `output/taira-sdk-consumer-20260912/candidate`. The canonical package
and its exact SHA-512 lock integrity were installed there with lifecycle scripts
disabled. The maintained checkout and earlier failed evidence are preserved.
Full typecheck and production Vite build pass against the actual package.
The five actual HTTP startup checks pass with the exact owner Wasm and production
CSP: configuration precedes Wasm, consumers await readiness, explicit retry works,
and malformed profiles start neither the codec nor API consumers. Successful
startup renders captured native Taira block and transaction responses. This is
an explicit test runtime, not signed release qualification or a live ledger test.

The initial unit run exposed Vitest selecting the SDK's Node implementation.
Test workers now load the exact real Wasm through the public initializer and use
Vite's browser resolution conditions; module-reset tests reinitialize their new
module graph. Bootstrap order tests retain their intentional cold startup.
The package and prefix cleanup is complete in the candidate. A single read-only
canonical package preflight replaces historical development/source-materialization
paths in postinstall, build, CI and Docker. It verifies the exact archive and all
200 installed files without executing or rebuilding SDK code. Mutation checks
first verify their unchanged baseline, then reject changed Wasm, glue, types,
metadata and missing or linked files. The selected prefix is reflected in actual
nested instruction expectations. The budget schema transition also updates the
synthetic release-store fixtures; all prior lifecycle and rollback paths are
still reached.

The original bundle gate correctly exposed the new transfer cost:
6,456,941 gzip bytes against the old 540,000-byte entry budget. The owner Wasm
accounts for 6,008,611 gzip bytes under the pinned Node toolchain. BPNG reviewed separate limits: retain
the existing non-Wasm entry budget, pin the exact Wasm identity and raw size,
cap Wasm at 38 MiB raw and 6.5 MiB gzip, and cap all startup assets at 7 MiB gzip.
The checker must report the whole transfer and reject missing, duplicated,
unexpected or oversized owners. The original failure remains in
`output/taira-sdk-consumer-20260912/bundle-initial.log`; the SDK bytes are unchanged.

The final combined candidate run passes **1,662 unit tests in 165 files**, with
one existing opt-in GPG skip. Full lint has zero errors (936 existing style
warnings); normal postinstall, normal build including typecheck, bundle budgets
and roadmap validation all pass. Six production HTTP browser scenarios and 16
desktop/mobile flows pass, including actual Wasm nested multisig decoding to
Taira accounts and the repaired transaction-row layout. The ordinary build
reproduces every browser-tested dist byte and mode. The source remains unchanged
through the combined gates at tree
`d4ba3137ccf258214bd00d3b727470ecf229754d578842ef5d3b80e41e9427f4`;
subsequent changes to this report and ROADMAP record those results. The receipt is
`output/taira-sdk-consumer-20260912/combined-validation.json`.

The reviewed budget reports 344,580 gzip bytes of JS/CSS, 104,363 of fonts and
HTML, and 6,008,611 of SDK Wasm: **6,457,554 / 7,340,032** total startup gzip bytes.
The stricter non-Wasm entry remains **448,943 / 540,000**. Fourteen budget tests
cover pin mismatches, absent/duplicate/misclassified owners, path aliases,
independent bounds, double counting and future growth. Release-fixture validation
adds 143 passing lifecycle checks with the existing one opt-in skip.

BPNG subsequently issued signed SDK attestation
`ab07757cc7a82e1e470b98623cd55d00ba3cb72536e437e1c6a959534fb05e84`
under `../bpng/png2-deploy/output/sdk-release-native106-20260912/`. Explorer
independently matched its installed SDK dist to the signed inventory
`ec8e87611eabf8443fdfa50dd76f2f806d75d3741844b565464ae72a301b3c59`,
including all 163 file/directory mode-bound entries.

**Deployment is now held for a replacement SDK.** A separate Linux consumer
found an address-codec cross-realm check rejecting a native typed-array result
under jsdom. The SDK owner is fixing and requalifying that facade; Rust and Wasm
are unchanged. The current signed packet and all Explorer successes are retained
as evidence for this exact candidate, not permission to activate it. The
maintained checkout's SDK/startup composition and public operator release remain
unchanged. The replacement archive, inventory pins and full consumer gates must
be reviewed again; no account validation or test assertion will be weakened.

## Live read follow-up

Read-only Chrome diagnostics with unchanged candidate assets reached the actual
public Taira APIs. Desktop rendered ten blocks and five transactions at snapshot
1180, then opened actual transaction and block details. Corresponding history,
instruction, ledger state and proof reads returned HTTP 200. Curated MCP block
and transaction reads independently returned HTTP 200 at 1180. No writes, browser
errors, unexpected origins, CORS errors or preflights occurred.

The phone check found a separate application recovery defect, tracked as EX-307.
Chrome continued the intercepted reads within one millisecond; the application
then canceled both requests at exactly five seconds. The cold connection took
about 6.8 seconds. Blocks retried successfully, but an open transaction SSE
connection suppressed latest-history polling despite the failed first snapshot
and no transaction event. The instrumented diagnosis is retained at
`output/taira-sdk-consumer-20260912/live-node106-current-sdk-20260912-run4-instrumented/diagnosis.json`.
This is not an upstream CORS failure or an interception deadlock.

A separate source candidate at `output/taira-sdk-followup-20260912/candidate`
preserves the original tested source and SDK evidence while correcting recovery
and the phone search-example overflow under EX-308. The latter uses the existing
full identifier and navigation target; only its available display width changes.
The current SDK remains held from integration and deployment. Recovery and
layout checks are recorded below; the replacement SDK's complete gates and signed
runtime admission are still required.

The follow-up implementation now tracks a successful history snapshot for each
filter and stream connection. An open event stream cannot suppress recovery
after an initial or refresh failure; reconnects require a new snapshot, and a
successful empty result completes recovery. The existing pending-request guard
prevents overlapping polls. The default total request deadline is 20 seconds;
caller cancellation and the single deadline across response bodies are retained.
The focused regression group passes 181 tests, with typecheck and scoped lint
passing. The full candidate suite passes 1,673 tests with one existing opt-in GPG
skip. The working checkout now includes the six scoped UI/recovery files and
passes its own 1,587-test suite, typecheck and scoped lint. Its package, lock, SDK,
startup and runtime bytes are unchanged; canonical integration remains held.

Search examples now have a width bound and visual ellipsis while retaining the
full accessible label, tooltip and navigation target. The new browser regression
checks individual chip rectangles at 320, 390, 768 and 1440 pixels in both themes
and text directions, plus keyboard navigation. All 18 desktop/mobile browser gates pass, including these bounds and navigation
checks and the existing transaction-row controls. Seven real-codec startup tests
also pass, including initial HTTP 500 followed by HTTP 200 while the same native
EventSource stays OPEN and sends zero transaction events. The loopback-only test
uses an explicit browser permission for its local preview origin; production-host
CSP and startup cases remain unchanged. Initial permission-denial and lint failures
are retained with their corrections in the follow-up evidence.

The new candidate uses its own frozen dependency install with lifecycle scripts
and pnpmfile hooks disabled. All 1,780 dependency links resolve inside that
candidate, and all 200 SDK files match the held package inventory. The original
candidate source and SDK remain unchanged. Receipts are retained under
`output/taira-sdk-followup-20260912`; this remains consumer validation of the held
package, not release admission.

The updated build also passes fresh read-only live Taira sessions at desktop
1440px and phone 390px: each renders 10 blocks and 5 transactions, then actual
transaction details and block metadata at snapshots 1194/1195. There are no browser
page errors or unexpected requests. Two block-filtered list bodies were still
finishing when their contexts closed and are not part of this success claim.
Screenshots and original network observations are retained under
`live-node106-current-sdk-20260912-followup-recovery`.

Normal production build, full lint, bundle and roadmap checks pass. The build
reproduces the exact browser-tested dist inventory
`2da3c2901f77bab718a7fd092ae083cc464ac23fee02d6c4f4052e942b0af439`.
Startup transfer is 6,457,571 gzip bytes against 7MiB; non-Wasm entry transfer
is 448,960 bytes against 540,000. These measurements still describe the held SDK.
No follow-up artifact has been published.

## Qualified replacement received

BPNG handed off the corrected signed SDK at 11:34:47 UTC. The exact package is
`02600597032e3c0074b915c06b6125aea3a98c549f60e0ccee7d75dfdbdbb79f`
(6,911,208 bytes), with signed attestation
`4bdefeacaa61844157e07082a8582b7ce547de1277a959e0340ed777dc30edd5`.
Its evidence root is
`/Users/takemiyamakoto/dev/bpng/png2-deploy/output/sdk-release-cross-realm-20260912`.
The corrected facade is cdad22f1; native 671 and the Rust/Wasm owner 50a4 remain
unchanged. The independent original native source must be taken from the prior
native106 evidence root, and the corrected owner source from the new evidence
root. Neither source is rebuilt or modified by Explorer.

A fresh `output/taira-sdk-replacement-20260912/candidate` was copied byte-for-byte
from the frozen verified follow-up source. It includes the completed layout and
history recovery fixes. No dependency directory was copied. Independent signed
SDK replay, exact vendored package/inventory pin updates and a frozen dependency
install are underway; full application and browser gates remain required for the
new package. The earlier held candidates and their evidence remain unchanged.

The actual signed application runtime and original release controller are still
required before publication. A local browser runtime profile is test context and
does not satisfy that requirement.

The first frozen install exposed a producer evidence mismatch: ordinary pnpm
normalizes 135 non-executable dist files from 0600 to 0644. All 200 package files
retain their exact signed bytes, but the installed dist inventory is
`7d3651220289a5f80bf073e114cb77fe2e194d05edecf58c39cf8172bef9404f`
rather than the archive-extraction inventory in the first replacement attestation.
BPNG independently observed the same ordinary npm-installed inventory and is
correcting the producer recipe and installed-dist evidence while preserving the
exact 02600597 package bytes. Explorer applies no chmod or verification exception.

The mode failure is retained in `installed-sdk-mode-mismatch.json` with the full
actual inventory. An orchestration error launched application checks immediately
after the failed mode check; postinstall, units and lint completed before the
process was interrupted to terminal status130. These incidental results are not
release qualification. The output-only consumer runner now checks the installed
byte/mode identity before any application command. Full gates remain pending the
corrected signed evidence.

## Installed-file evidence correction received

The signed correction issued at 12:10:47 UTC keeps the exact 02600597 package and
binds the ordinary npm/pnpm-installed dist inventory 7d365122. Its attestation is
`6dc1b223e482a7121247132e9a1efecf24700de8b0428866e20d2268e18bbb74`
and the fourteen-input map is
`62c5436f838e5d6f3c585b6498b053336e0047411fbec3eed294fa6ce1eafbe4`.
The corrected evidence root is
`/Users/takemiyamakoto/dev/bpng/png2-deploy/output/sdk-release-installed-dist-20260912`.
Only recipe, toolchain and dist evidence changed; the other eleven signed raw
inputs and package bytes remain identical. Independent replay and a fresh final
consumer install are being prepared under `output/taira-sdk-admitted-20260912`.

The additional read-only live entity check passes transaction-authority account
navigation, account list/detail and domain list/detail on desktop and phone. The
public asset-definition list is authoritatively empty, so no asset-detail success
is claimed. Initial test-runner assumptions about an obsolete account field were
corrected to the actual `id`; no application behavior changed for those checks.
The screenshots identified a separate mobile account-card line-break issue,
tracked as EX-309 and being corrected before the final consumer build.

## Final consumer qualification and maintained integration

The corrected packet passed independent signature verification, all fourteen
original inputs, independent clean native-source replay and source ancestry.
The fresh ordinary pnpm installation matched all 200 SDK files and the signed
installed dist7d365122; all 1,780 dependency symlinks resolved inside the candidate.
No SDK build, package mutation, mode normalization or verification exception was
performed by the consumer.

The frozen candidate source is
`b9abdfd69fe6ef0195c9a2c933282e90003d33a3df8539ea2136b69f2b019b47`
and the built mode-bound dist inventory is
`8ed4afdea8b047f96a208ec44626ef8df50ca5ebddcc65f4637400aa4163e70d`.
All 1,673 unit tests passed in 166 files with one pre-existing GPG skip; full
lint including `.mts`, typechecked production build, bundle and roadmap gates
passed. The initial run retained an unhandled delayed callback from a synchronous
route-query test mock. Its promise contract, timer progression and teardown were
fixed without changing production behavior, and the full suite passed cleanly.
All seven actual-codec and eighteen desktop/mobile browser tests passed.

EX-309 is now integrated locally. Mobile account IDs stay on one line at
320/390/480/640 pixels in both themes, use the card's available width and retain
full copy/title/navigation values. Actual Taira reads exercised ten home blocks,
five latest transactions, transaction and block details, three block transaction
rows, transaction-authority account navigation, account list/detail and domain
list/detail at 1440 and 390 pixels. Both visible asset-definition pages were
actually empty; asset detail is explicitly excluded from live coverage.

Output-only network recording sometimes produced Chrome response-body capture
errors despite visible complete records. The initial failures are retained.
A controlled run without the second CDP observer passed all entity checks and
captured both authoritative empty asset responses. The history run retained
complete block-transaction responses and matching three UI rows at both widths;
two phone block-metadata body recordings still failed, so no complete raw-body
capture claim is made for those responses. No application fallback or synthetic
API response was introduced to pass live checks.

An independent review and before-hash guard applied 55 exact changed files and
two added test directories to the maintained checkout. It preserved all earlier
dirty changes and the local `public/config.json` bytes, with backups of every
replacement and the six explicitly retired development SDK files. Maintained
source matched the tested candidate immediately after integration; subsequent
changes in this checkout only update this report and the roadmap. All evidence
is retained under `output/taira-sdk-admitted-20260912`, especially
`consumer-test-cleanup-validation.json`, `independent-sdk-verification-final.json`,
`independent-fresh-install-verification.json`, `integration-plan.json`, and
`integration-applied.json`. These are consumer checks, not signed application
release or deployment evidence.

## Operator publication and public startup

The user explicitly requested publication. The native, DPN and BPNG coordinators
released the existing static operator corridor, and release
`20260912T124538Z-sdk-b9abdfd69fe6-operator` is now served at
`https://taira-explorer.sora.org` from the maintained macOS edge at
`administrator@208.83.1.62`. This is separate from the BPNG OVH Explorer mirror.
The frozen candidate application bytes were published unchanged. All 189 public
files matched their expected hashes, and the previous 192-file tree is retained
for guarded atomic rollback. No nginx reload or native service change was part
of this static publication.

The artifact SHA-256 is
`6df41910f7b9c7a4af9bfa5dc9069d526f54010952125d67c85e511f41acd1b9`;
public index SHA-256 is
`7bb1cfa9a4ec6ce106dd0e6868ec3d38df644a8a235c64ea6d4f5318aa6638e4`.
The four-field runtime binds the canonical network ID, prefix 369 and forced
direct `https://taira.sora.org` endpoint. Public release metadata truthfully sets
`signedSdkVerified: true` and `signedReleaseQualified: false`.

Actual public phone navigation passed transaction, block and account details.
The initial 30-second cold-start check then timed out in another fresh browser.
An independent fresh Chrome process without request interception loaded five
transactions and ten blocks in 35.4 seconds without application errors; the
36,931,654-byte uncompressed codec finished transferring at 32.1 seconds.
The browser's optional post-render response-body capture exceeded its inspector
cache, so that diagnostic recording failure is preserved separately from the
successful startup. Independent full public byte verification already matched
the Wasm SHA-256. EX-310 addresses the missing static compression; its shared
nginx reload is held by the native rollout coordinator after a validator
cold-recovery failure in its subsequent 107 rollout. This report does not claim
that rollout is healthy or complete; no nginx mutation has been performed.

Original publication, host inventories, independent byte verification and browser
receipts are retained under `output/taira-sdk-publish-20260912`. The maintained
nginx template now contains scoped gzip configuration; this infrastructure change
does not alter the published application artifact.

## Remaining signed release qualification

1. Obtain the genuine signed Explorer runtime and original maintained release
   controller appropriate to global Taira. The current BPNG runtime schema also
   requires BPNG provisioning state; a scoped Explorer corridor must bind actual
   ledger/native and host authority without fabricating unrelated business state.
2. Run the original controller against the reviewed maintained source, complete
   lock, all fourteen original SDK inputs, actual signed runtime and pinned tools.
   Retain full app/browser gates and original build/dependency inventories.
3. Coordinate the resulting qualified release through its host admission and
   atomic release path, then verify actual public assets, runtime, data and
   layouts. The current operator publication does not claim this qualification.

A subsequent 90-second cold-browser diagnostic failed with the explicit bootstrap
error before any API import. Direct public blocks and transactions still returned
HTTP 200 at snapshot 1260. The signed SDK itself imposes a 30,000 ms total codec
fetch deadline, so a slower uncompressed transfer can fail even when the browser
assertion allows 90 seconds. This establishes compression as a functional delivery
repair. Evidence: `public-browser-verification-cold.json` and
`codec-delivery-diagnosis.json` in the publication output. The native owner has
been asked for a short exclusive reload window during its recovery investigation;
the explicit hold remains effective until handback.

## Completed compression and final public verification

The native owner explicitly released the shared reload window after its updater
exited, while its recovery investigation continued offline. The Explorer change
added only the four reviewed gzip directives. `nginx -t` and one graceful reload
both exited zero, preserving mode 0600, owner and all unrelated configuration.
The full shared config hash changed from
`3f634e2fa99e790b9ff6fb2c1101a4bb2d1178a13724488128e086728e8bb03f` to
`c17b6ad2b37df443f7373688f8dd1caaccf66c9877c78debc4ebe9827b1350dc`.
The guarded apply receipt SHA-256 is
`60b54b60f1307bc9ccd6c6b76e42c1ab8ad3ff64e99782e6a18053af3e0429a2`.
Its script passed sixteen isolated positive and failure-path checks before use;
rollback retains the original config outside nginx's include directories.

A real public gzip GET transferred **6,022,172 bytes**, decompressing to the
original **36,931,654-byte** Wasm and SHA-256
`fbc434ef49154351478b49524e44e0f2f08b71ce38be4912ec4e73ff546863eb`.
JavaScript and CSS gzip GETs also retained exact artifact hashes. Public responses
include `Content-Encoding: gzip` and `Vary: Accept-Encoding`.

Four fresh pinned Chrome processes, one per 390/1440-pixel and dark/light view,
passed actual public application startup, five latest transactions, ten blocks,
transaction details, block 1260 with two transactions, and account list/detail
navigation. No page errors, unexpected origins/methods or horizontal overflow
were observed. The phone IDs remain on one line and detail IDs remain complete.
Cold startup measured **10.65–12.68 seconds**, including **6.83–8.89 seconds** for
the codec transfer, below the signed SDK's thirty-second download bound. Browser
Resource Timing independently observed 6,022,172 encoded / 36,931,654 decoded
bytes in every fresh process. The previous 90-second failed cold-load receipt is
retained as the pre-compression failure; it is not overwritten by the passing run.

The shared nginx window was explicitly returned to the native owner, and DPN/BPNG
were informed. Public reads at partial chain height 1260 establish Explorer read
availability; they do not establish a healthy or completed native 107 rollout.
The current operator artifact and its truthful qualification flags are unchanged.
Formal signed application qualification remains the separate work listed above.

Final evidence under `output/taira-sdk-publish-20260912`:
`nginx-gzip-host-apply-receipt.json`, `compression-verification.json`,
`public-browser-verification-compressed.json`, `public-browser-compressed.log`,
and screenshots in `public-browser-compressed/`.
