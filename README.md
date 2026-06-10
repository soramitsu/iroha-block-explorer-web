# iroha2-block-explorer-web

This repository is managed by Terraform!

## Build

Node v20+ with Corepack is required.

```bash
corepack enable
pnpm i
pnpm build
```

Build artifacts will be located at `dist` dir.

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

The explorer loads an optional runtime config JSON before mounting the app. This is useful for subpath deployments and
for overriding the default Torii base URL without rebuilding the frontend.

The file is fetched from:

- `${BASE_URL}config.json` (for example `/explorer-iroha2/config.json`)
- Fallback: `/config.json`

Supported keys:

- `toriiBaseUrl` (string): default Torii base URL used by the node selector when no user override is stored.
- `sorafsPublicBaseUrl` (string): optional public gateway origin used to build `/sorafs/cid/<cid>/...` links on
  `/sorafs/registry`. When omitted, the explorer falls back to the active Torii base URL and then
  `window.location.origin`.
- `toriiEconometricsEndpointsEnabled` (boolean): set to `false` to force-disable Torii econometrics endpoints and use the
  UI fallback scanners (the default is auto-detect).

Example file: `public/config.json.example` (copy to `public/config.json` for local builds; it is gitignored).

### Local run

```bash
corepack enable
pnpm i
pnpm dev --host 0.0.0.0 --port 5173
```

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
ops/taira/deploy-explorer.sh
```

The script builds the current checkout and syncs `dist/` into the served root
used by `https://taira-explorer.sora.org/`.

## Compatibility and Versioning

This frontend tracks the current upstream `../iroha` Torii route surface. There is no `/v2` compatibility layer in the
Explorer routing code; update this repo when Torii routes move.
