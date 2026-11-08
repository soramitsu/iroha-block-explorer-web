# Taira Explorer data recovery — 2026-09-12

The [subsequent layout repair](taira-layout-2026-09-12.md) preserves this data
recovery and records the current served artifact.

The public Explorer now reads directly from `https://taira.sora.org` using the
current history contract and the current Taira genesis identity.

## Cause and correction

The deployed history schema limited cursors to 192 characters. Current Torii
returns 153-byte `IHC2` frames encoded as 204 base64url characters, so successful
HTTP responses were rejected before their rows could render. The history schema
now requires the current 204-character frame and rejects earlier or malformed
frames. Regression fixtures contain captured native Taira responses; tests cover
initial pages, cursor continuation, and snapshot consistency.

The requested checkout also polled the privileged `/v1/explorer/metrics` route
from the anonymous home page. It now uses the authoritative public
`/v1/telemetry/live` snapshot and stream. Missing data is unavailable; retained
data stays stale until a fresh snapshot arrives after reconnect. The home page
does not invent zero counts or a one-node network.

Taira and BPNG production hosts require exactly `toriiBaseUrl`,
`toriiForceBaseUrl`, and a canonical checked `networkId`. The origin must be
`https://taira.sora.org` and forcing must be true. Proxy origins, failover fields,
extra fields, missing configuration, and malformed identities fail closed.
The release validator enforces the same profile.

The served configuration's old network identity was also replaced using the
authenticated current deployment metadata, cross-checked against public block 1
and the SDK's checked NetworkId encoder:

```text
hash:97507E381726890C14F116C07577A26146286D6B2C2747F902FC08D8FBE4731D#DF02
```

Only the Explorer TLS server block was replaced with
[`ops/nginx/explorer.taira.conf`](../../ops/nginx/explorer.taira.conf).
It serves static files and the SPA route, with `Cache-Control: no-cache` so
browsers revalidate deployments. Old same-origin API proxies and aliases were
removed. Public Torii already supplies the required Explorer CORS origin.

## Published artifact

The live source differed substantially from the requested checkout. To preserve
the deployed UI, the live application was rebuilt in
`/Users/takemiyamakoto/dev/.taira-explorer-recovery-20260912` from its recorded
source and landing-page patch, with the current history/profile correction.
The corresponding fixes and regression coverage are also present in
`/Users/takemiyamakoto/dev/iroha-block-explorer-web`.

| Item | Value |
| --- | --- |
| Release | `20260912T040218Z-data-72ceee042d8c-operator` |
| Live source base | `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0` |
| Original landing patch SHA-256 | `7c290ae4fe5d23ea8f073d9287a68466c71dd5241329a67f7ac15d5a47350b50` |
| Repair patch SHA-256 | `72ceee042d8c72f3d3c34c01e25e6b9fee0f6e8d752d0484831d25d6bce7db91` |
| Preserved live SDK revision | `16866ffbe8406c7565548d0be8110209b8cba2bc` |
| Current native runtime revision | `53ba8d70bddc3c2a6299bd4df5a6412207772c87` |
| Final archive SHA-256 | `c2d35d41d412df53c8cc63d6d78a3b739c2b253176bd2872f656348bf1511b93` |
| Served index SHA-256 | `a62909659fda08e7e72a50b9e2c929035b6303cc4c7d8584012acbe1e3523878` |
| Public files verified by hash | 192 |

Publication used the existing operator frontend deployment route, with an atomic
directory exchange, retained predecessor, exact per-file verification, and a
receipt outside the served tree. This is explicitly an **operator recovery**, with
`signedReleaseQualified: false` in public `release.json`. It does not qualify
either Explorer SDK revision as a signed release of the current native runtime.
The normal signed release tool's admission requirements remain in force. Adopting
the current canonical shared Rust/Wasm SDK remains coordinated with its native
and BPNG owners; this recovery makes no signed-write or codec qualification claim.

The current served `dist` is a real directory. Converting it to the normal signed
release tool's symlink/manifest layout is a separate qualified release transition.
There were no native daemon, validator, or ledger mutations.

## Verification and evidence

Both builds used Node 24.19.0 and pnpm 10.11.0.

- Requested checkout: 157 unit-test files, 1,514 passed, one existing opt-in skip;
  typecheck, production build, lint, bundle budgets, and roadmap checks passed.
- Requested checkout: 14 hermetic desktop/mobile browser checks passed, including
  current history responses and real-shaped cursor pagination.
- Preserved live-source build: 149 unit-test files, 1,840 passed, one existing
  opt-in skip; 501 focused tests, typecheck, production build, lint with zero
  errors, and bundle budgets passed.
- Public static root and deep routes return the expected index and cache policy.
  Configuration matches public genesis. Direct Torii history responses and
  continuation requests return HTTP 200 with the correct CORS origin and stable
  snapshots.
- Final fresh public-browser check passed: home, blocks, transactions, accounts,
  domains, three list continuations, and block/transaction details. Every Explorer
  API response came directly from `https://taira.sora.org`, with no HTTP failures
  or browser exceptions. The home page displayed 13 accounts, 13 assets, six
  domains, 862 blocks, 1,041 transactions, and four nodes at observation time.
  The latest sample was correctly labeled stale when more than a minute old.

Local evidence is retained under `output/taira-recovery-20260912/`: final gate
logs, captured fixtures, source bundle and patches, build inventory,
`publish-plan.json`, final deployed receipt, `static-vhost.log`, public browser
results (`live-browser-final.json`), and a home-page screenshot
(`live-home-final.png`). `candidate-build-metadata.json` describes the
build before runtime configuration injection; `final-deployed-receipt.log`
describes the actual 192-file publication.
