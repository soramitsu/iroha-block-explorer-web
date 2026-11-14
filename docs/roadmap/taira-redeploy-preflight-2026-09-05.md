# Taira Explorer redeployment preflight — 2026-09-05

Update: SSH access was restored and authenticated on September 6. See the [deployment-host audit](taira-redeploy-host-audit-2026-09-06.md) for the current blockers.

Roadmap: EX-316. The user explicitly authorized redeploying the completed EX-314 redesign to `taira-explorer.sora.org`. Deployment has not occurred. This report records read-only release checks and the prerequisites still needed to use the repository's supported release process.

## Deployment access

- The documented nginx root is `/Users/administrator/dev/iroha2-block-explorer-web/dist`, on the deployment host. That directory is absent on the current development machine.
- A bounded SSH attempt to `administrator@taira.sora.org:22`, using batch authentication and strict host-key checking, timed out. This does not establish whether the deployment host has a different SSH address or port.
- The local SSH configuration contains no Taira deployment alias. After the user explicitly authorized searching this computer for Dublin/MacStadium credentials, a local two-line host/password record was found outside the repository. Its account is `administrator` and its address is `208.83.1.62`, matching both current Taira DNS names and an existing trusted SSH host key. The record does not itself identify a Dublin location.
- A second bounded SSH attempt used that saved address and a runtime-only password reader, with strict host-key checking and one authentication prompt allowed. Port 22 timed out before authentication; password validity could not be tested. The temporary password-reader helper was removed. No password or private-key contents were printed, copied into this repository, or placed in command arguments.
- An additional local MacStadium inventory contains encrypted credentials for five different hosts, with no entry for the current Taira address and no alternate Taira port or bastion. No unrelated server was contacted. Searches of Documents, Desktop, and Downloads were denied by macOS permissions. After the saved Taira address also timed out, the user confirmed that no VPN, bastion, or alternate port is required: the current Wi-Fi blocks port 22. Resume the connection check after switching to a network that permits SSH.
- No operator runtime-config or nginx-capture path is supplied in this session's release environment. Those inputs and the private release store must be inspected on the actual deployment host.

## Current public state

Observed on 2026-09-05 using bounded read-only public requests; configuration and runtime were rechecked at 09:09:53 UTC:

| Check | Observation | Release implication |
| --- | --- | --- |
| Explorer `/` | HTTP 200, `text/html`, 1,608 bytes; entry assets `index-EdtYiLwx.js` and `index-yFRq1yGA.css`. | Existing frontend remains reachable. |
| Explorer `/accounts` | Same HTML as `/`. | History-mode route serves the application shell. |
| Explorer `/release-manifest.json` | HTTP 200 with the same SPA HTML, rather than a JSON manifest. | No active manifest or complete release inventory can be verified from the public endpoint. |
| Explorer `/config.json` | HTTP 200 JSON; `toriiBaseUrl` is `https://taira-explorer.sora.org`, `toriiForceBaseUrl` is true, and `networkId` is absent. | Public configuration does not satisfy the runbook's direct-Torii origin and canonical network identity requirements. |
| Torii `/status`, accepting JSON | `build.git_commit_sha` is `b1da38607524a44f5a55e0a89a171004744a3bd7`; `build.version` is `2.0.0-rc.2.0`. | Runtime differs from the final Explorer SDK/profile pin `16866ffbe8406c7565548d0be8110209b8cba2bc`. |
| Browser preflight for `GET /v1/explorer/blocks` with `Accept`, from the Explorer origin | HTTP 405, `application/x-norito`, `Allow: GET,HEAD`, without the required CORS allow headers. | Direct browser access required by the release runbook is not ready. |

All three cataloged CORS preflights were checked at 09:09:32 UTC. `POST /v1/pipeline/transactions` with `Content-Type` and `POST /v1/multisig/spec` with `Content-Type`, `X-Iroha-Account`, `X-Iroha-Signature`, `X-Iroha-Timestamp-Ms`, `X-Iroha-Nonce`, and `X-Iroha-Witness` also returned 405 (`Allow: POST`). Every preflight response lacked `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers`. These were OPTIONS requests naming headers; no authenticated transaction or multisig request was submitted.

The identical `/`, `/accounts`, and `/release-manifest.json` bodies have SHA-256 `fb1c5d6385df9313ed2b10c45e2ea01164d9a10d5bd66919edd6e1cd00b27e31`. That index matches the checked-in reviewed baseline inventory for Explorer `68ccf50f3944aff310d1d11d5ee3c04f93f250ba`. Matching one public file does **not** prove the complete baseline inventory or a valid active manifest. Baseline initialization also requires runtime `986cc54ed6bd0bd5adf5c9dfc191288abf034046`, which differs from the runtime observed above.

EX-315 separately records incompatible public blocks/latest-transactions pagination. The redesign preserves strict response validation; deploying it alone would not resolve those Torii contracts.

## Source and build readiness

- EX-314 implementation passed the complete validation recorded in [the implementation evidence](design-ux-implementation-2026-09-05.md): 1,793 unit tests, 28 browser cases, typecheck, lint, production build, bundle budgets, localization, and roadmap checks.
- This working tree remains at unsigned Explorer HEAD `c651b4c257f4ba865775cc49e7f290442a557c5c`, with 508 changed/untracked status entries at the start of this preflight. Much of that work predates EX-314. The existing index and working-tree changes were preserved.
- Canonical public `master`, read with `git ls-remote`, is `f90f1d53d9d36ee2d4b10ce2ec3b05ce72930491`. GitHub reports its commit signature as valid; that is not a substitute for the release tool's pinned-signer verification. No branch was pushed or rewritten.
- The development sibling Iroha checkout was observed at unsigned HEAD `0240c4332b1d32c84b86775968c87671d717457a`, with 43 changed/untracked status entries. It is not the clean pinned SDK checkout required for release; it was left untouched.
- No production deployment command, release-store initialization, symlink change, nginx change, or Torii rollout was attempted. The existing built `dist` has no release manifest and is not a substitute for a source-verified isolated release build.

## Remaining release work

1. Establish the SSH access route to the saved Taira deployment host (port 22 currently times out), then inspect its nginx serving configuration, operator config, source checkouts, and existing release/rollback inventory.
2. Establish the final clean, signed canonical Explorer source containing the redesign, and a clean sibling SDK checkout at the exact declared pin. Preserve the current development worktree.
3. Resolve the runtime revision and public CORS/collection contract gaps, with a verified migration path for the existing live tree. Current public evidence does not satisfy either direct deployment or the runbook's exact baseline initialization; do not manufacture a manifest or bypass those checks.
4. Execute the applicable supported wrapper workflow only after its prerequisites hold. Retain the previous release, then verify the published manifest, every public artifact, `/` and `/accounts`, the runtime revision, browser CORS, and the redesigned interface in both native themes.

The governing release procedure is [ops/taira/README.md](../../ops/taira/README.md). Roadmap integrity (316 unique task rows) and scoped diff checks pass for the documentation-only preflight changes; the application code has not changed since EX-314 validation.
