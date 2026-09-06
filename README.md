# iroha2-block-explorer-web

This repository is managed by Terraform!

## Build

Node 24.19.0 with Corepack is required; the exact release runtime is also recorded in `.node-version`.

```bash
corepack enable
pnpm i
pnpm build
```

The production container independently pins the readable Node and Caddy tags to their OCI
multi-platform index digests, asserts Node `24.19.0`, and installs the same integrity-pinned pnpm
`10.11.0` used by the local/CI exact-toolchain bootstrap.

### Exact CI and local gate runner

The Jenkins worker is the multi-architecture, digest-pinned Playwright 1.58.2 Noble image so its
Chromium build and native browser dependencies cannot drift. That image ships Node 24.13.0, not the
required Node 24.19.0. Jenkins therefore uses `scripts/bootstrap-exact-toolchain.sh` to download the
official Node 24.19.0 archive for Linux x64/arm64 and verify the checked-in SHA-256. The archive is
rehash-verified on every invocation and freshly extracted into an owner-only per-run directory
before any repository JavaScript executes; cached executables are never trusted. The exact runtime
then installs integrity-pinned Corepack pnpm 10.11.0 into an owner-only per-run directory and runs
every repository gate from the canonical checkout with `CI=1`, a fresh pnpm store, and a forced
frozen/offline install. Corepack registry, credential, and integrity-key overrides are discarded. No project
package or test is executed by the image's original Node binary or a stale Playwright server.

Use the same path locally on macOS or Linux to reproduce the final Jenkins gates:

```bash
sh scripts/bootstrap-exact-toolchain.sh node scripts/run-ci-gates.mjs
```

Enable the live Mochi browser gate only with a clean, canonical checkout at the profile-pinned
Iroha revision. Start that Mochi sandbox first; the CI gate verifies its deterministic seed and
drives Chromium, but does not create or replace the running sandbox. An explicit path is useful
when the qualified checkout is not the literal sibling:

```bash
RUN_LIVE_MOCHI_E2E=1 \
IROHA_REPO_ROOT=/absolute/canonical/path/to/iroha \
sh scripts/bootstrap-exact-toolchain.sh node scripts/run-ci-gates.mjs
```

The path control is discarded unless the live gate is explicitly enabled, and only that gate
receives it. Relative, missing, non-directory, and symlink-traversing paths fail closed; the Mochi
wrapper also rejects any tracked or untracked checkout change before executing upstream code.

The first run populates `iroha-explorer-web-toolchain` under the operating system's temporary
directory. Set `IROHA_EXPLORER_TOOLCHAIN_CACHE` to a normalized absolute path for a different
isolated cache. Its parent must already be canonical and either owner-controlled or the operating
system's sticky temporary root; the cache itself must be a real current-account-owned mode-`0700`
directory. Filesystem roots, home/temp roots, immediate root children, repository paths, symlinks,
and permissive existing caches are rejected. Only rehash-verified archives are trusted from this
cache; Node, Corepack, and pnpm executables are freshly materialized per run. The bootstrap and gate children
also discard `NODE_OPTIONS` and `NODE_PATH`. Playwright payloads use the persistent owner-only
`ms-playwright` directory inside that exact-toolchain cache (or an explicit normalized
`PLAYWRIGHT_BROWSERS_PATH`, such as the digest-pinned Jenkins image's `/ms-playwright`). Local
machines without the matching Chromium payload can install it once through the exact toolchain
before running the gates:

```bash
sh scripts/bootstrap-exact-toolchain.sh pnpm playwright:install
```

Build artifacts will be located at `dist` dir.

### Docker

`Dockerfile` is also provided.

## Development

Frontend talks directly to Torii. By default it uses `window.location.origin` as the Torii origin and appends the
current `/v1/explorer/*` or `/v1/*` route itself, matching the upstream `../iroha` contract.

Set `VITE_API_URL` to an exact Torii origin (for example `http://127.0.0.1:8080`) when
developing against a remote node. Vite’s dev server proxies the public `/v1` surface to
`http://127.0.0.1:29080` by default (override with `VITE_TORII_PROXY_TARGET`), so running Torii locally on that port
works without extra flags. Diagnostic namespaces such as `/status` and `/metrics` are deliberately not proxied into
the browser; Torii may limit their availability through its global API-token/admitted-CIDR policy.
The production `Caddyfile` now only serves the built Explorer; there is no `/api` reverse proxy because all data is
fetched directly from Torii’s public `/v1/explorer/*` and `/v1/*` app API endpoints.

## Runtime config (`config.json`)

The explorer loads runtime configuration before mounting the app. Production builds fail closed when the file is
missing, non-JSON, structurally invalid, or does not contain both the exact `networkId` and exact `toriiBaseUrl`.
Development builds may omit the file so the Vite proxy and build-time defaults remain usable locally. This supports
subpath deployments and binds a reviewed release to its NetworkId and Torii origin without rebuilding the frontend.

The file is fetched from:

- `${BASE_URL}config.json` (for example `/explorer-iroha2/config.json`)

Supported keys:

- `networkId` (string, required in production): the exact canonical checksummed `NetworkId` derived from the selected
  node's genesis header. It is application-pinned and required for canonical-auth and Connect-backed reads;
  human-readable chain labels are not accepted.
- `toriiBaseUrl` (string, required in production): exact Torii origin used by the node selector when no user override
  is stored. Credentials, paths, queries, and fragments are rejected.
- `toriiForceBaseUrl` (boolean): ignore a previously stored node choice and apply `toriiBaseUrl` at startup. Release
  profiles use this to bind the Explorer to their reviewed Torii origin.
- `kotodamaCompilerUrl` (string): explicit base URL of a trusted canonical Rust Kotodama compiler service. The Studio
  sends `POST /v1/kotodama/compile` beneath this base URL and sends the complete generated source. This service is
  separate from Torii; the Explorer does not infer or default it from `toriiBaseUrl`. Production URLs must use HTTPS
  (the upstream SDK permits HTTP only for loopback development). Studio compilation remains disabled when this key is
  absent. A build can instead provide the same explicit value through `VITE_KOTODAMA_COMPILER_URL`.
- `toriiFailoverEnabled`, `toriiFailoverPersistSwitch` (boolean): enable configured-node failover and optionally
  persist a successful switch.
- `toriiFailoverNodes` (string array): exact absolute Torii origins eligible for failover.
- `toriiFailoverFailureThreshold`, `toriiFailoverWindowMs`, `toriiFailoverProbeTimeoutMs` (positive integers):
  failure-window and health-probe policy.
- `toriiRequestTimeoutMs` (positive integer), `toriiRequestRetryCount` and `toriiRequestRetryBaseDelayMs`
  (non-negative integers): bounded public API request retry policy.

Example file: `public/config.json.example` (copy to `public/config.json` for local development; it is gitignored). Production builds
exclude root `config.json`; release packaging must install a reviewed runtime file before recording its digest. Absence is a startup error rather than an implicit same-origin
or build-time fallback.

### Local run

```bash
corepack enable
pnpm i
pnpm dev --host 0.0.0.0 --port 5173
```

### Deterministic Mochi integration chain

The Explorer pins its local integration network in `tests/mochi/explorer-profile.json`. That one
revision governs the sibling Torii/Mochi runtime and sibling `@iroha/iroha-js` browser SDK.
The wrapper uses the literal sibling unless `IROHA_REPO_ROOT` names an explicit checkout. At the
Mochi consumer boundary it requires that path to be absolute, normalized, existing, and a canonical
real directory (not a symlink). It also refuses to execute a different revision or a checkout with
tracked or untracked changes, so an upstream bump must be reviewed together with the profile pin and
a fresh Explorer typecheck/build.
It also gives the debug peer runtime a 32 MiB worker-stack floor; set `RUST_MIN_STACK` explicitly
to override that floor for a constrained or instrumented environment.
The wrapper also loads `tests/mochi/explorer-local.toml`, which enables Torii's native CORS policy
only for the explicit loopback Vite/Playwright origins used by this repository.

```bash
pnpm mochi:up
pnpm mochi:status
pnpm mochi:verify-seed
```

Mochi writes runtime-only bootstrap material to `.env.local` and `.mochi/generated/*`; both stay
uncommitted. Use `pnpm mochi:mcp-add-command` to print the exact local MCP registration command,
and `pnpm mochi:down` when the integration chain is no longer needed. `pnpm mochi:reset` wipes only
the profile-scoped local chain state before recreating a fresh deterministic run.
The wrapper selects `/usr/bin/python3` on macOS and `python3` elsewhere for the upstream helper;
set `MOCHI_PYTHON` explicitly to use another validated interpreter.

### Nginx subpath deployment

Explorer can be served from any nginx virtual host under the `/explorer-iroha2/` subpath.

Build the frontend for that subpath:

```bash
VITE_APP_BASE_PATH=/explorer-iroha2 pnpm build
```

Then:

1. Sync `dist/` into the nginx-served subdirectory:

```bash
sudo mkdir -p /var/www/iroha2-block-explorer-web/explorer-iroha2
sudo rsync -a --delete dist/ /var/www/iroha2-block-explorer-web/explorer-iroha2/
```

2. Include `ops/nginx/explorer.subpath.locations.conf` in the existing nginx `server { ... }` block for the target host.
3. Validate and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`VITE_APP_BASE_PATH` defaults to `/`, so normal root deployments remain unchanged.

### Taira root deployment

The live Taira explorer is served from the nginx root documented in
`ops/taira/README.md`. On the Taira host, run:

```bash
export TAIRA_RUNTIME_CONFIG=/secure/operator/taira-explorer-config.json
ops/taira/deploy-explorer.sh deploy
```

The release runbook requires a clean signed checkout, exact SDK/runtime pin parity, an audited
operator config, a verified nginx root, immutable manifests, atomic cutover, and a retained rollback
release. Complete the one-time baseline initialization in `ops/taira/README.md` before first use.

## Compatibility and Versioning

This frontend tracks the current upstream `../iroha` Torii route surface. There is no `/v2` compatibility layer in the
Explorer routing code; update this repo when Torii routes move.
