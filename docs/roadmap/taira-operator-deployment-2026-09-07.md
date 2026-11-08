# Taira Explorer frontend deployment — 2026-09-07

Roadmap: EX-316. The user repeatedly renewed the explicit instruction to deploy after the strict release-path blockers had been reported. The validated frontend was published through the existing operator-managed nginx document root at **2026-09-07 02:32:30 UTC**. This is an operator frontend deployment, not a qualified signed release; the strict release tool was not changed to accept this host.

## Published artifact

- Public site: https://taira-explorer.sora.org
- Explorer source: `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0`.
- Release ID: `20260907T023145Z-dc9e64fdd002-operator`.
- All 523 source archive files match that commit. All 188 built files match the previously validated inventory.
- Deployment includes those 188 files plus a schema-valid production `config.json`. No application code was changed for deployment.
- Index SHA-256: `87c1d4b5033e2a39953c65d5d6a9c6ff79a1a0025b72437a3614495fecc2d26e`.
- Deployment archive SHA-256: `f6defd651ff805ef284ee83f9c8c2c73a763a3415bb2a6a9842fb2ff7b29f26c`.
- Build validation remains Node 24.19.0/pnpm 10.11.0: typecheck, lint with zero errors, production build, bundle budgets, 1,814 passing unit tests and one existing skip, 28 hermetic browser tests.

## Live configuration and cutover

The running validator configuration points to the September 1 reset bundle. Its `genesis.identity.toml`, `genesis.expected_hash`, and the independently fetched public `/v1/explorer/blocks/1` response agree on genesis hash `0466da18c70ca8cbd51b8cc60b1d4a4802fc5d7f928d505806d7cd6cb61d60ef`. The pinned SDK successfully parsed its canonical NetworkId literal:

`hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85`

Production config uses the existing same-origin Torii connection `https://taira-explorer.sora.org`, with forced node and failover disabled. Retired configuration keys were removed. Native system/manual light and dark theme behavior is preserved.

The server verified every uploaded file and tested macOS atomic directory exchange on the same filesystem before cutover. It atomically exchanged the prepared directory with the existing real `dist` directory. The old root remains intact at:

`/Users/administrator/dev/iroha2-block-explorer-web/releases/pre-20260907T023145Z-dc9e64fdd002-operator`

The new root also retains 238 non-conflicting previous hashed assets so already-open clients can still load their lazy chunks. The previous release record was retained privately. The current release record explicitly records `signedReleaseQualified: false`. The earlier verified full frontend/nginx archive backup also remains available. Nginx routing and Torii processes/ledger were unchanged.

## Verification

The cutover command checked public HTTP 200 responses and exact hashes for HTML, production config, JavaScript and CSS entrypoints, plus SPA route delivery at `/`, `/accounts`, `/blocks`, and `/transactions`. Automatic rollback was armed for failure of these checks; all passed.

Independent public HTTPS verification passed for all **189/189 deployed files**, with exact expected byte lengths and SHA-256 hashes. Post-cutover host verification confirmed both the new index and the complete 262-file rollback directory remain intact. The live root contains the 189 release files plus 238 retained old assets.

Unmocked Chromium smoke passed **16/16 frontend checks** in system light and dark at 1280×720 on desktop and 390px/320px phone widths. Search validation preserves input, clear works, drawer focus containment/Escape/focus restoration/navigation work, active routes remain marked, and manual theme preference persists across reloads. Header height is 72px on desktop and 105px on phones, with no horizontal overflow. Both desktop activity headings and state messages fit in the initial 720px viewport. All six screenshots were visually inspected.

The browser recorded zero uncaught JavaScript errors, console errors, HTTP failures, or failed script/CSS assets. Eight SSE cancellations occurred during deliberate navigation/reloads. Real telemetry displayed 17 accounts, 14 assets, 7 domains, 7 blocks, 9 transactions and 4 nodes. Recent blocks and transactions displayed the expected explicit data-error/Retry states for the known response-contract gaps.

Local machine-readable receipts are in `output/release-review/dc9e64fdd002/`: `operator-deployed.json`, `live-http-inventory-check.json`, and `live-smoke/report.json`, alongside six screenshots and the browser run log.

## Remaining qualification

EX-315 remains open: the current Torii runtime returns older block pagination and a latest-transactions payload lacking the required cursor/snapshot fields. The frontend retains strict validation and exposes unavailable/error states for incompatible data. This deployment does not establish live collection compatibility, SDK/runtime parity, source-signing qualification, or completion of the strict legacy release-store migration. Direct-origin CORS qualification also remains separate; this deployment uses the host's existing same-origin route.
