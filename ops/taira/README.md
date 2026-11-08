# Taira Explorer release runbook

The [2026-09-12 canonical SDK publication](../../docs/roadmap/taira-sdk-integration-2026-09-12.md)
records the currently served frontend artifact and its explicit qualification
limits. That operator release uses an atomically exchanged real `dist` directory. The
signed release procedure below requires its own manifest and symlink layout;
the operator receipt does not satisfy those admission requirements.

The Taira nginx vhost must serve this symlink:

```text
/Users/administrator/dev/iroha2-block-explorer-web/dist
```

Immutable releases are retained beside it under `releases/<explorer-sha12>-<runtime-sha12>/`.
Each release contains a deterministic `release-manifest.json` binding the complete public-file
inventory, runtime config, package lock, Explorer revision, SDK/profile revision, and Torii runtime
revision. It also records `generator_revision`, the signed final-tool checkout that produced the
manifest, plus a closed `sdk_provenance` record (dependency, source revision/tree, and reviewed
package/lock/profile digests). No command deletes an existing release.
The repository-root `/releases/` store is deliberately ignored by Git so initializing the live
store does not make the deployment checkout dirty. The release tool does not trust that exclusion:
it independently validates the store ownership, permissions, canonical paths, immutable inventory,
and manifest digests before every transition.

All mutating commands fail unless `nginx -T` contains exactly one TLS
`taira-explorer.sora.org` content block whose single explicit top-level `root` is the served `dist`
symlink, whose `index` is `index.html`, and whose sole location is the reviewed history-mode SPA
fallback `try_files $uri $uri/ /index.html`. Any nested `root` or `alias` that could override
effective serving is rejected. Server-local `include` directives and alternate content handlers
such as proxy, FastCGI, uWSGI, SCGI, gRPC, rewrite, or return are also rejected; the release gate
must be able to prove that the symlink is the effective source of every public file. One shared
port-80 block may also name the host, but only with the exact reviewed ACME location and
HTTP-to-HTTPS redirect. The serving block accepts only the reviewed `listen 443 ssl` and
`listen [::]:443 ssl` forms; a missing `ssl`, an extra port-80 listener, or unreviewed listener
options fail closed. Duplicate or ambiguous serving blocks also fail closed. Certbot's inheritable
TLS-options include therefore belongs at nginx HTTP scope, outside the Explorer server. Quoted or
otherwise unparseable directive names are rejected instead of being ignored. Set
`TAIRA_NGINX_CONFIG_DUMP` to a reviewed `nginx -T` capture only when the deployment account
cannot run `nginx -T` directly. That capture must be a deployment-account-owned canonical regular
file and must not be group- or world-writable; symlinks and mutable/foreign-owned captures are
rejected.

The public edge must compress the packaged browser codec. The signed SDK bounds
its download to 30 seconds; serving the 36.9 MB Wasm uncompressed can prevent
startup. The maintained [Explorer nginx block](../nginx/explorer.taira.conf) enables
gzip at level 6 for `application/wasm`, `application/javascript` and `text/css`,
with `Vary: Accept-Encoding`. Verify a real gzip GET, its decompressed artifact
hash and a fresh browser startup after a coordinated shared nginx reload.

## Required release inputs

- Run the release tool with exactly Node `24.19.0` and pnpm `10.11.0`. Both the Node process and the
  `node` found by the isolated build PATH are checked at the exact patch version.
- Use clean checkouts at signed, `git verify-commit`-valid revisions from the canonical
  `soramitsu/iroha-block-explorer-web` origin. Before any package command or build, the release tool
  fetches `master` from the fixed canonical public HTTPS URL into the local tracking ref; it never
  depends on the checkout's accepted SSH URL, SSH config, or agent. Normal build/publish commands
  require HEAD to equal that fetched revision and independently verify the same tip through a fresh
  owner-only bare repository fetched from the same fixed URL. The reviewed baseline is the sole build
  exception and must be a signed ancestor of fetched `origin/master`. Initialization similarly verifies the exact
  manifest-pinned generator through fresh canonical refs, but does not require that retained generator
  to remain the current branch tip. Transition adoption and rollback never fetch Git; they require the
  local, clean, signed checkout HEAD to equal the retained manifest's already-verified
  `generator_revision`.
- Keep a sibling `../iroha` checkout at the exact SDK revision. It must be clean, signed, an
  ancestor of the freshly fetched canonical `hyperledger-iroha/iroha` `optimizations` branch, and
  have the reviewed `javascript/iroha_js` tree. Reachability and the subtree are independently
  verified in a fresh
  owner-only bare repository fetched from the fixed canonical HTTPS URL with explicit branch
  refspecs; checkout-local remotes, refspecs, and remote-tracking refs are not provenance. Normal
  deployment records this source closure in the manifest.
- Set `TAIRA_RUNTIME_CONFIG` to a deployment-account-owned, non-symlink JSON file outside every
  Explorer checkout, isolated build, and release-store parent. It must not be group- or
  world-writable. The exact four-field frontend profile is required: `toriiBaseUrl` must be
  `https://taira.sora.org`, `toriiForceBaseUrl` must be `true`, `networkPrefix` must be `369`, and `networkId` must be the
  canonical `hash:<64 uppercase hex>#<4 uppercase CRC16>` identity supplied from authenticated
  deployment metadata. The checksum and Iroha marker bit are checked. Missing identities or prefixes, any different prefix,
  proxy origins, failover settings, and all extra fields are rejected. Start from
  [`config.json.example`](config.json.example) and replace its identity placeholder with the
  deployment value; never infer or default it. The file is validated and
  installed into the build before its digest is recorded.
- Deploy only after `https://taira.sora.org/status` reports the same full revision pinned by
  `package.json`, `pnpm-lock.yaml`, and `tests/mochi/explorer-profile.json`. The status request
  explicitly negotiates JSON. Every runtime check also sends
  `Origin: https://taira-explorer.sora.org` and fails unless Torii returns that exact
  `Access-Control-Allow-Origin`. It then requires cataloged CORS preflights for both
  `GET + Accept` on `/v1/explorer/blocks`, `POST + Content-Type` on
  `/v1/pipeline/transactions`, and canonical-auth `POST` on `/v1/multisig/spec` with
  `Content-Type`, `X-Iroha-Account`, `X-Iroha-Signature`, `X-Iroha-Timestamp-Ms`, and
  `X-Iroha-Nonce`, and `X-Iroha-Witness`; server-side reachability alone cannot satisfy the browser
  smoke.
- Before baseline initialization or any transition, deploy the final upstream Taira
  `[torii.cors]` configuration and generated public-edge nginx configuration containing the exact
  `https://taira-explorer.sora.org` origin. Verify that browser contract while the existing
  same-origin Explorer proxy is still serving traffic. Then replace the Explorer vhost with the
  reviewed static-only vhost and immediately run baseline initialization, which installs the
  direct-`https://taira.sora.org` operator config before its locked public smoke. Do not remove the
  old same-origin proxy first or activate a direct-Torii Explorer before CORS is live; either order
  creates a browser outage.
- Keep `TAIRA_EXPLORER_SERVED_DIST` and `TAIRA_EXPLORER_RELEASES_DIR` as sibling paths ending in
  `dist` and `releases`. Broad filesystem targets are rejected. Their parent, the release store,
  the uninitialized live tree, and every retained release directory/file must be owned by the
  deployment account and must not be group- or world-writable. Every public directory must be
  traversable and every public file readable by an unprivileged nginx worker. Every filesystem
  ancestor through the shared release parent must also be a canonical real directory traversable by
  that worker before any release mutation starts. Initialization creates and durably syncs a
  non-listable release store and requires its mode to remain exactly `0711`; its mode-`0700`
  transaction locks stay private. Unsafe or unservable existing permissions are rejected, not
  repaired.

Useful overrides are:

```text
TAIRA_EXPLORER_ROOT
TAIRA_EXPLORER_SERVED_DIST
TAIRA_EXPLORER_RELEASES_DIR
TAIRA_NGINX_BIN
TAIRA_NGINX_CONFIG_DUMP
```

The wrapper is the only supported release CLI entry point. Its absolute `/bin/sh` interpreter fixes
`PATH` to the checked-in system path before running any external command, validates command arity,
canonicalizes `TAIRA_EXPLORER_ROOT`, and strips shell and Node preload variables. The shell-first
bootstrap rehashes and freshly extracts the exact official Node archive, then enters the dedicated
`taira-release` exact-toolchain profile; an operator cannot select the profile's executable or module.
That profile forwards only the documented common inputs plus the minimum command-specific Taira
inputs, invokes the canonical release tool with the absolute verified Node executable, and supplies a
mode-`0600`, one-use attestation bound to the extracted Node path and digest, release-tool path and
digest, public-only GPG verifier path/keyring, and exact argument vector. It converts the pinned
[`trusted-release-signers.asc`](trusted-release-signers.asc) public key into an owner-only per-run
keyring; it does not inherit the operator's GPG home or expose private keys. The current allowed
OpenPGP primary fingerprint is `9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB`, and the armored key
file's pinned SHA-256 digest is
`6e5f5a01094f7257c7bb29708d2479d67beeb0cc945b20cce2b24f6b84c7808e`.

That key file must contain exactly one trusted primary key; the release gate intentionally has no
old/new overlap mode. A signer change is therefore an out-of-band trust-anchor handoff, not a normal
release. Pause deployments, have the repository/security owners authenticate the incoming full
fingerprint and armored-key digest over independent protected channels, and record their approval
beside the exact transition commit SHA. In one reviewed change, replace (do not append to) the key,
fingerprint, and pinned digest, and sign that transition commit with the incoming key. Independently
deliver the approved commit SHA, fingerprint, and digest to the deployment operator, who must compare
all three before replacing the protected clean checkout. Resume only after the exact-toolchain tests
and a real-GPG integration check pass with the incoming key. The outgoing tool cannot authenticate
this single-key transition; repository access or a Git signature alone is not authorization for it.

Direct `node ops/taira/release-tool.mjs ...` invocation and the retired public wrapper marker are
rejected because Node preload options execute before JavaScript can enforce release gates.

The attestation proves the repository-controlled bootstrap/profile path and detects ordinary PATH or
system-Node bypass; it is not authentication against a process deliberately emulating the files under
the same deployment UID. Host account isolation, owner-only toolchain directories, a protected clean
checkout, and signed revisions are the trust boundary for that same-UID case. The wrapper does not
expose a preflight/build/publish gap: every
build runs in disposable detached Explorer and Iroha worktrees with a fresh pnpm store, frozen
fetch, offline frozen install, and a sterile environment that does not inherit frontend/deployment
variables, Node injection, registry credentials, proxies, or TLS overrides.

The public Explorer URL, Torii origin/status URL, and nginx host are fixed in this Taira-only tool
and cannot be redirected with environment overrides.

## One-time audited baseline import

The live directory must be migrated once before normal deployment. Prepare a separate clean checkout
of Explorer `68ccf50f3944aff310d1d11d5ee3c04f93f250ba`, whose audited SDK/profile
revision is `a457d6b60846923441fea549edcae30626c5e939`. Its local SDK dependency resolves to a
clean signed sibling Iroha checkout at that exact revision. The baseline gate hard-codes and verifies
all of these reviewed values:

```text
dependency          file:../iroha/javascript/iroha_js
package.json SHA256 e943734aa0612d8064433d7810b05b2e5926b6a5331d32d9892eb27ee8790dbd
pnpm-lock SHA256    706f8678d4d5bcf24df3217717c0c68fab3aac215883f8fa4ba49943345ece01
profile SHA256      ecd38f35fa0890db545da63450cea65cc18aad599500966a55890cd7de3906f1
SDK subtree tree    c86222b3f00374381c48b06210ef8267f5ee0411
Torii runtime       986cc54ed6bd0bd5adf5c9dfc191288abf034046
```

The checked-in `baseline-public-inventory.json` is the canonical reproduced live inventory (167
public files). It intentionally excludes operator-owned `config.json`; manifest generation installs
and binds that file separately. The command verifies provenance before pnpm, reproduces the
historical artifact in paired disposable Explorer/Iroha worktrees, performs the frozen/offline build,
and refuses any output that differs from the checked-in inventory. The
historical artifact may never be relabeled for another runtime: create its manifest and initialize
the release store while Torii still reports the reviewed currently deployed revision
`986cc54ed6bd0bd5adf5c9dfc191288abf034046`:

```bash
export TAIRA_EXPLORER_ROOT=/secure/worktrees/explorer-68ccf50
export TAIRA_RUNTIME_CONFIG=/secure/operator/taira-explorer-config.json
export TAIRA_EXPLORER_REVISION=68ccf50f3944aff310d1d11d5ee3c04f93f250ba
export TAIRA_SDK_REVISION=a457d6b60846923441fea549edcae30626c5e939
export TAIRA_RUNTIME_REVISION=986cc54ed6bd0bd5adf5c9dfc191288abf034046
install -d -m 700 /secure/reviewed
export TAIRA_MANIFEST_OUTPUT=/secure/reviewed/taira-baseline-release-manifest.json
/path/to/final-explorer/ops/taira/deploy-explorer.sh manifest
```

Manifest publication uses an exclusive atomic hard-link step in the output directory. It never
replaces an existing directory entry: a regular file, symlink (including a dangling symlink), or
concurrent publisher at `TAIRA_MANIFEST_OUTPUT` makes the command fail and leaves that entry intact.
The output directory must already exist as a canonical real directory; the command never creates
its parents recursively. Both publication and temporary-link cleanup are synced to that directory.
The reviewed manifest must remain owned by the deployment account and must not be group- or
world-writable when transferred to the Taira host.

Review and preserve that manifest, then initialize on the Taira host. Initialization validates and
snapshots the operator config before creating the release store or lock and before touching the live
tree, then compares every non-operator live byte with the checked-in inventory. Under the release
lock it records the original `config.json` bytes and mode, installs the exact operator config bound
by the manifest as an explicitly nginx-readable mode-`0644` file, verifies the full
result, renames the directory into the immutable release store, and atomically creates the served
symlink. It then runs the complete public manifest/file/runtime smoke test while still holding the
lock. Any confirmed failure restores and durably syncs both the original directory and exact original
config bytes and mode. Published release manifests are likewise written explicitly as mode `0644`,
independent of the invoking account's umask. Baseline generation verifies both clean signed checkouts and records the final tool
checkout as `generator_revision`; initialization requires that exact generator checkout and proves
the revision is still signed and reachable from freshly fetched canonical refs, even if canonical
`master` has advanced. The external manifest is opened without following symlinks, checked for
deployment ownership and non-writable group/world mode, parsed and canonicalized from one file
snapshot, and passed into the locked initializer without a second path read.

Initialization refuses an uninitialized live directory that already contains the reserved
`release-manifest.json`; preserve and investigate that file instead of allowing it to be silently
reclassified or lost.

```bash
unset TAIRA_EXPLORER_ROOT
cd /path/to/final-explorer
export TAIRA_RUNTIME_CONFIG=/secure/operator/taira-explorer-config.json
export TAIRA_BASELINE_MANIFEST=/secure/reviewed/taira-baseline-release-manifest.json
ops/taira/deploy-explorer.sh initialize
```

Initialization is idempotent only when the symlink points to the exact supplied reviewed baseline
manifest and that release verifies locally and publicly. A different active release is never silently
accepted as the baseline, even if its public bytes happen to match. A parent-directory sync failure
after pointer rename is reported as commit-uncertain and must be inspected; the tool does not pretend
that publication was rolled back.

## Same-runtime deploy, verify, and roll back

From the clean signed final Explorer checkout, with the runtime config still set:

```bash
ops/taira/deploy-explorer.sh deploy
ops/taira/deploy-explorer.sh verify
```

`deploy` is one uninterrupted Node-tool operation. It runs the exact pin gate, creates disposable
detached worktrees and a fresh pnpm store, performs frozen fetch plus offline frozen install, builds,
and enforces the route-aware bundle budget. Its callback injects the operator config, copies the
artifact into private release-store staging, reruns the bundle checker against those copied bytes
immediately before manifest creation, syncs every staged file and directory, publishes one immutable
release, and atomically switches the symlink. It then fetches the public manifest and every public
file, verifies their sizes/hashes, requires both `/` and the representative `/accounts` deep route
to return the exact active `index.html` bytes as `text/html`, and checks the exact Torii revision
before the build callback may return and its worktrees are removed. A failed public smoke automatically restores and verifies the
previous release, which must declare the currently running Torii revision; the failed immutable
release remains for diagnosis. If release-store rename
succeeds but its directory sync cannot be confirmed, the command reports commit uncertainty. Retry
with identical inputs: only byte-for-byte files and canonical manifest bytes are adopted. Before an
exact existing release is selected, the tool resyncs its full tree, reverifies its bytes, and fsyncs
the release-store directory; any failure leaves the current Explorer selected.

Normal `deploy` is strictly same-runtime: it refuses to switch from an active Explorer manifest for
one Torii revision to another revision. That active-runtime gate runs before the isolated builder, so
`deploy` cannot become a post-Torii-change transition build. Same-runtime smoke failure retains the
existing automatic Explorer rollback behavior.

Each initialize, deploy, prepare-transition, transition, or rollback transaction holds an owner-only
`.taira-release.lock` directory with a random owner-only lease entry from before release-store
mutation through public smoke and any automatic rollback. Contention fails immediately; a
crash-stale directory and lease remain available for explicit operator inspection. Cleanup removes
only its unguessable lease, verifies the lock directory's original device/inode identity, and uses
atomic non-recursive `rmdir`; a replacement owner or distinct lease is never removed. Lease ownership
failures are reported together with any action failure.
The release parent and store ownership/mode checks are repeated around lock acquisition and cutover,
and device/inode identities are rechecked so a replaced path cannot be mistaken for the inspected one.
If lock removal succeeds but the parent-directory sync fails, the tool reports lock-removal
durability uncertainty and preserves any action and cleanup errors for operator inspection.

Roll back by the exact retained release ID printed by `deploy` or visible under `releases/`:

```bash
BASELINE_RELEASE_ID="68ccf50f3944-986cc54ed6bd"
ops/taira/deploy-explorer.sh rollback "$BASELINE_RELEASE_ID"
```

Rollback is refused if the target expects a different currently deployed Torii runtime. It performs
no Git fetch or package operation: the exact target manifest is verified first, then the local clean,
signed tool checkout must equal its `generator_revision`. Even an already-active target receives the
full public manifest/file/runtime smoke check.

## Coupled Torii runtime transition

The transition is deliberately split at the Torii change, but building and publishing are never
allowed after that change. Let `P` be the active predecessor Torii revision and `U` the final pinned
revision.

While Torii and the active Explorer still report `P`, declare `P` and prepare `U`:

```bash
export TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION=986cc54ed6bd0bd5adf5c9dfc191288abf034046
ops/taira/deploy-explorer.sh prepare-transition
U_RELEASE_ID="<exact release ID printed by prepare-transition>"
```

`prepare-transition` verifies the active manifest and live Torii are still `P`, verifies the final
Explorer/SDK/profile pin `U`, performs the complete isolated build and both bundle gates, and durably
publishes the immutable `U` release with predecessor `P`. It never changes the served symlink and
never tries to smoke a `U` Explorer against Torii `P`. A retry adopts only byte-for-byte identical
retained bytes and still does not activate them.

Only after preparation succeeds may Torii move to `U`. The `U` rollout must retain the exact
Explorer-origin CORS contract described above. Wait until `/status` reports the full `U` revision
and the release tool's status/read/write browser preflights pass, keep the exact prepared tool
checkout, and adopt the exact retained ID:

```bash
ops/taira/deploy-explorer.sh transition "$U_RELEASE_ID"
ops/taira/deploy-explorer.sh verify
```

`transition` is adoption-only. It performs no build, package command, SDK-source verification, or
network Git operation. It verifies the retained canonical manifest/files, requires the local signed
tool checkout to equal that manifest's generator, requires the manifest predecessor to be the exact
active release at `P`, and requires live Torii to equal the target manifest's `U`. It then switches
and runs the public smoke under one lock. If smoke fails, the tool deliberately leaves the `U`
Explorer selected; it never switches to the now-incompatible `P` release. The typed error prints the
exact failed and predecessor release/runtime identities.

Recovery is runtime-first. Roll Torii back to the predecessor revision printed in the error and wait
for `/status` to report it. Only then run the ordinary runtime-compatible Explorer rollback:

```bash
BASELINE_RELEASE_ID="68ccf50f3944-986cc54ed6bd"
ops/taira/deploy-explorer.sh rollback "$BASELINE_RELEASE_ID"
ops/taira/deploy-explorer.sh verify
```

The rollback command rejects this operation while Torii still reports `U`. If the predecessor smoke
then fails, the predecessor Explorer remains selected while Torii is at its predecessor revision;
the typed error prints the exact forward-recovery runtime, release, transition predecessor, and
command. Restore Torii to `U`, wait for `/status` to report `U`, restore the exact final Explorer tool
checkout that generated the retained `U` release, and explicitly re-adopt that same ID:

```bash
export TAIRA_COUPLED_PREVIOUS_RUNTIME_REVISION=986cc54ed6bd0bd5adf5c9dfc191288abf034046
ops/taira/deploy-explorer.sh transition "$U_RELEASE_ID"
ops/taira/deploy-explorer.sh verify
```

That transition succeeds only if the retained `U` release still matches its canonical manifest and
exact predecessor. Retain initialization, preparation, transition, smoke, and any coupled recovery
output as EX-290 release evidence.
