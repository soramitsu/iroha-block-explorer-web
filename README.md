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
also discard `NODE_OPTIONS` and `NODE_PATH`. Local machines without the Playwright Chromium payload can install
the matching browser through the same exact toolchain before running the gates:

```bash
sh scripts/bootstrap-exact-toolchain.sh pnpm playwright:install
```

Build artifacts will be located at `dist` dir.

The SDK dependency is the admitted consumer archive with SHA-256
`02600597032e3c0074b915c06b6125aea3a98c549f60e0ccee7d75dfdbdbb79f`.
Install, `pnpm check:sdk`, and normal build verify the archive and all 200 installed
files against `vendor/iroha-iroha-js-0.0.3.files.json`, including the existing SDK
JavaScript and Wasm. The checker is read-only: missing distribution files fail
verification. CI checks the archive before dependency installation; postinstall
checks the installed package. Package integrity does not grant release admission:
deployment still requires the original signed SDK and application build evidence.

### Docker

`Dockerfile` is also provided.

## Development

Frontend talks directly to Torii. By default it targets `${window.location.origin}/v1/explorer`, matching the current
routes exposed by the upstream `../iroha` repo.

Set `VITE_API_URL` to point at a different Torii instance (for example `http://127.0.0.1:8080/v1/explorer`) when
developing against a remote node. Vite’s dev server proxies `/v1` plus Torii root endpoints used by the app (`/status`,
`/metrics`, `/peers`) to `http://127.0.0.1:29080` by default (override with `VITE_TORII_PROXY_TARGET`), so running Torii
locally on that port works without extra flags. Adjust the proxy rules in `vite.config.mts` if your setup differs.
The production `Caddyfile` now only serves the built Explorer; there is no `/api` reverse proxy because all data is
fetched directly from Torii’s `/v1/explorer/*`, `/v1/*` app API endpoints, and root `/status`/`/metrics`/`/peers`
endpoints.

## Runtime config (`config.json`)

The Explorer requires runtime configuration before mounting the app. The file is fetched only from
`${BASE_URL}config.json` (for example `/explorer-iroha2/config.json`). Missing files, invalid profiles, transport
errors, and missing network prefixes reject startup with an explicit retry; no other config location or default
network is selected.

On `taira-explorer.sora.org` and `explorer-bpng.soramitsu.io`, configuration contains exactly
`toriiBaseUrl: "https://taira.sora.org"`, `toriiForceBaseUrl: true`, the authenticated deployment's canonical checked
`networkId`, and `networkPrefix: 369`. These production hosts reject proxy endpoints, absent or different prefixes,
and extra settings. Unpinned development hosts must explicitly configure their selected network's integer prefix from 0 through
65535; all instruction decoding receives that same value without inferring it from addresses or payloads.

On `bokolo-explorer.soramitsu.io`, the only accepted four-field configuration binds
`toriiBaseUrl: "https://bokolo.soramitsu.io"` and `toriiForceBaseUrl: true`.
`networkId` must be the canonical checked identity and `networkPrefix` must be the
integer prefix from authenticated CBSI deployment metadata; neither value is copied
from Taira or selected by the browser. The separate Bokolo website remains at the
Torii origin's `/` route. Publish this Explorer config only after the Bokolo
`/v1/*` routes, CORS for the Explorer origin, native revision, signed SDK and
application artifact have been verified together. The Taira-only release tool in
`ops/taira` does not authorize a CBSI Explorer release.

Supported keys:

- `toriiBaseUrl` (string): default Torii base URL used by the node selector when no user override is stored.
- `toriiForceBaseUrl` (boolean): binds every request to the configured endpoint and disables manual, scoped-route, and peer failover overrides.
- `networkPrefix` (integer, required): selected network prefix supplied from authenticated deployment metadata. Taira and
  BPNG require `369`; other profiles accept integers from `0` through `65535`. No string coercion or default is applied.
- `networkId` (string): exact Iroha NetworkId for Connect session identity binding. The production Taira and BPNG hosts require
  the checksum-valid Norito JSON spelling `hash:<64 uppercase hex>#<4 uppercase CRC16>` and preserves it losslessly.
  Raw hexadecimal NetworkIds are rejected. Connect remains disabled when
  this value is absent or invalid; the Explorer never infers it from a Torii URL or substitutes a generic/test
  NetworkId. Production deployments should project it from authenticated ledger metadata.
- `kotodamaCompilerUrl` (string): explicit base URL of a trusted canonical Rust Kotodama compiler service. The Studio
  sends `POST /v1/kotodama/compile` beneath this base URL and sends the complete generated source. This service is
  separate from Torii; the Explorer does not infer or default it from `toriiBaseUrl`. Production URLs must use HTTPS
  (the upstream SDK permits HTTP only for loopback development). Studio compilation remains disabled when this key is
  absent. A build can instead provide the same explicit value through `VITE_KOTODAMA_COMPILER_URL`.
- `sorafsPublicBaseUrl` (string): optional public gateway origin used to build `/sorafs/cid/<cid>/...` links on
  `/sorafs/registry`. When omitted, the explorer falls back to the active Torii base URL and then
  `window.location.origin`.
- `toriiEconometricsEndpointsEnabled` (boolean): set to `false` to force-disable Torii econometrics endpoints and use the
  UI fallback scanners (the default is auto-detect).

Example file: `public/config.json.example` (copy to `public/config.json` for local development; it is gitignored).
Production builds intentionally exclude that root file: the deployment server must inject its independently signed and
verified `config.json` instead of accepting developer-local bytes from `dist/`.

History lists use the current native `cursor`/`limit` protocol and retain the server's snapshot
height and hash while scanning or resuming. Blocks, transactions, instructions, and deployment
history do not synthesize numbered pages or totals. Transaction caches bind the exact canonical
NetworkId and effective Torii endpoint; unscoped caches are ignored, and outage data is labeled stale.
RWA domain identifiers accept the native ASCII wire form (`domain.dataspace`), including validated
punycode labels. Econometrics reports bounded scans as incomplete until cursor exhaustion and
does not infer per-leg effects from an AssetBatch without authoritative leg outcomes.

### Local run

```bash
corepack enable
pnpm i
pnpm dev --host 0.0.0.0 --port 5173
```

### Deterministic Mochi integration chain

The Explorer pins its accepted local integration network in `tests/mochi/explorer-profile.json`.
This local runtime profile is separate from signed Taira release admission. Its integration
evidence must be refreshed for the admitted SDK before supporting new release claims.
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
