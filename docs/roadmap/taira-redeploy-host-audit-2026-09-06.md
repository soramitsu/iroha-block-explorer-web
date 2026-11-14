# Taira Explorer deployment-host audit — 2026-09-06

Roadmap: EX-316. Continues the [September 5 preflight](taira-redeploy-preflight-2026-09-05.md) after the user renewed the deployment request. The saved SSH credentials now authenticate successfully. No frontend files, nginx configuration, release links, or Torii processes were changed.

## Access resolved

Authenticated as `administrator` on the saved Taira host using the existing trusted SSH host key. The host reports Darwin. Password input stayed in a temporary, owner-only reader outside the repository; no password was printed or placed in command arguments. The earlier network timeout is resolved.

## Verified live deployment

The nginx root is `/Users/administrator/dev/iroha2-block-explorer-web/dist`. It is a real directory, not the initialized release symlink required by the current release tool. Its sibling `releases` directory is mode `0755`; the current tool requires `0711`. No canonical `release-manifest.json` exists anywhere under this deployment root.

The host's `current-release.json` names:

- Active release: `20260728T073553Z-68ccf50f3944`.
- Retained release: `/Users/administrator/dev/iroha2-block-explorer-web/releases/20260728T073553Z-68ccf50f3944`.
- Recorded rollback: `/Users/administrator/dev/iroha2-block-explorer-web/releases/pre-20260728T073553Z-68ccf50f3944`.

Its legacy `release.json` records Explorer `68ccf50f3944aff310d1d11d5ee3c04f93f250ba`, SDK `a457d6b60846923441fea549edcae30626c5e939`, Node `22.23.1`, and pnpm `10.11.0`. It has no current-format runtime-coupled manifest. The receipt says the previous deployment did not reload nginx.

A read-only hash/size inventory verified that all 167 files in the checked-in reviewed baseline inventory are present and unchanged in the live directory. The live directory contains 262 files total: 95 additional paths, including older assets, operator config, and legacy release metadata. This is not an exact reviewed inventory and cannot be silently certified as one.

The active TLS vhost in `/opt/homebrew/etc/nginx/servers/taira.sora.org.conf` uses the documented root but includes `/status`, `/v1`, Connect, MCP, transaction, and legacy `/api/v1` proxy/rewrite locations. It does not satisfy the current static-only nginx gate. Those proxies remain serving the existing same-origin frontend configuration.

## Runtime and source prerequisites remain

Public probes at 09:13 Brisbane on September 6 (23:13 UTC on September 5), and an independent `/status` request from the admitted deployment host, report runtime `b1da38607524a44f5a55e0a89a171004744a3bd7`, version `2.0.0-rc.2.0`. The host reports target `aarch64-apple-darwin`. The redesign pins SDK/profile `16866ffbe8406c7565548d0be8110209b8cba2bc`.

All three cataloged browser CORS preflights still return HTTP 405 with no CORS allow headers. Public `/config.json` still forces the Explorer's own origin as Torii, omits the required network identity, and contains retired configuration keys. Public `/release-manifest.json` still returns SPA HTML. The pagination gaps recorded in EX-315 remain relevant to deploying the redesigned collection views.

The deployment host's separate source checkout, `/Users/administrator/dev/iroha-block-explorer-web`, is at `493d8781ce39a333cd27dec6b60931b4e7ac08c4`, with an untracked `ops/taira` directory containing the old build-and-rsync script. It does not contain the current reviewed release tooling. GPG is installed, but no secret signing keys are listed in the deployment account. The local development checkout still contains the redesign as uncommitted changes; the last inspected signed canonical master does not contain it. Source and build evidence remain in the earlier preflight and EX-314 implementation report.

## Why cutover did not run

The current supported wrapper has no applicable publish operation for these inputs:

- `deploy` requires an initialized manifest and agreement between active manifest, live runtime, and the final SDK pin.
- `initialize` accepts only the exact reviewed historical baseline, including runtime `986cc54ed6bd0bd5adf5c9dfc191288abf034046`; that is not the current runtime.
- `prepare-transition` requires an initialized, verified active predecessor matching the live runtime. The legacy directory and metadata do not supply that prerequisite.
- `transition` only adopts a previously prepared, verified immutable release. None exists here in the supported format.

Running the old rsync script would bypass the current release contracts and publish a frontend against known incompatible Torii responses. Changing only nginx or removing the same-origin proxies before CORS succeeds would also break browser API access. Neither was done.

The remaining work is a coordinated release migration: establish signed canonical redesign source, qualify the matching Torii runtime and browser contracts, and implement a reviewed transition from the verified legacy host state with a runtime-compatible recovery path. This exceeds a frontend-only redeploy. SSH credentials are no longer a blocker.

Roadmap integrity and scoped diff checks pass for this documentation-only update. The application remains at its previously validated EX-314 implementation, and the public site remains on its existing July release.
