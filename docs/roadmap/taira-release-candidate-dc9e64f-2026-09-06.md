# Taira redeployment preparation — dc9e64f, 2026-09-06

> Deployment update: the operator frontend cutover completed on September 7 after renewed user authorization. See [deployment evidence](taira-operator-deployment-2026-09-07.md). The preflight results below are historical and the strict qualification gaps remain recorded.

Roadmap: EX-316. The user renewed the Explorer redeployment request. This continues the earlier [host audit](taira-redeploy-host-audit-2026-09-06.md) with the now-clean integrated frontend source. Cutover has not occurred.

## Concrete preparation completed

The clean Explorer commit `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0` contains the approved redesign and strict first-release contracts. It was rebuilt with exact Node 24.19.0 and pnpm 10.11.0. Validation passed:

- Typecheck and production build.
- Bundle budgets and lint, with zero lint errors and 1,429 existing warnings.
- All 148 unit files: 1,814 tests passed, one existing skip, 68.26 seconds.
- All 28 desktop/mobile hermetic browser tests, 37.5 seconds, including native light/dark behavior.

The available verified toolchain extraction and integrity-pinned pnpm from the earlier bootstrap were reused for local validation. The restricted sandbox initially blocked the browser's localhost server and stalled the release-tool unit file; the existing suites completed after being run outside that sandbox. No test or release guard was weakened.

A local review bundle is retained at `output/release-review/dc9e64fdd002/`. It includes the exact source archive, 188 built assets with SHA-256/size inventory, and all successful validation logs. Its proposed Taira config comes from the exact pinned upstream commit `16866ffbe8406c7565548d0be8110209b8cba2bc`, specifies network identity `82531CE8…#3E94`, and passes the existing configuration validator. Browser-test runtime config is excluded from the built-asset package; the proposed config remains separate and uninstalled. The bundle is explicitly unsigned review material, not an immutable production release.

## Live backup and recheck

Saved SSH credentials authenticate with the existing trusted host key. The host still reports Torii revision `b1da38607524a44f5a55e0a89a171004744a3bd7`, version `2.0.0-rc.2.0`, and the existing July Explorer release. The served `dist` remains a real directory and no canonical release manifests exist.

Created and verified this private backup on the deployment host:

```text
/Users/administrator/dev/deploy-backups/explorer-before-dc9e64f-20260906T120600Z-32i37j5c/live-explorer-and-nginx.tar.gz
```

It contains the current Explorer files, `current-release.json`, and active Taira nginx configuration. The directory is mode `0700`; archive and metadata are `0600`. The archive is 3,316,369 bytes with SHA-256 `790798b3f563f0f0fe6d1a770ef2fd16dd1c77ca43ea940cada5446b039091b2`. Required archive members were verified and the files were synced. Its adjacent `backup.json` records the evidence. The live index remains SHA-256 `fb1c5d6385df9313ed2b10c45e2ea01164d9a10d5bd66919edd6e1cd00b27e31`.

This backup is preparation only. No frontend cutover, nginx edit/reload, validator restart, ledger replacement, or Torii rollout occurred. Private nginx contents stayed on the deployment host.

## Remaining owner and backend prerequisites

The clean merged frontend commit is unsigned. Fresh canonical GitHub inspection at 2026-09-06 11:56 UTC found master `44f82919201c94c11fbf14d6dd2b88ad0e7d6edc`, whose signature matches the trusted key, but which does not contain the redesign. The current local merge includes it without conflicts; publication still needs the release signature required by `ops/taira/README.md`. The user was asked for the signing setup/location for fingerprint `9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB`, not for private-key material. No private key is configured on either inspected machine.

The backend transition also needs qualification. Canonical GitHub cannot resolve live revision `b1da386…`: its commit API returns 422 and its corresponding profile file returns 404. The deployment host's `iroha` and `iroha-build-latest` checkouts also lack that commit object. Consequently the exact live-source ancestry and ledger replay compatibility with target `16866ff…` remain unverified.

The target's profile has the expected `82531CE8…#3E94` network identity. The newer sibling working checkout instead specifies `0466DA18…#BA85`; that different template must not be substituted for the target or assumed to identify the live ledger. The scoped target runbook does not establish a ledger-preserving transition from this live revision. Its documented `public-reset` path explicitly creates fresh active state and requires separate signed `reset_and_deploy` authorization; it is not a non-destructive upgrade procedure. No reset was requested or attempted.

All three cataloged CORS preflights were rechecked during this attempt and still returned 405 without allow-origin/method/header responses.

The reviewed migration must therefore establish the live source and genesis, qualify replay of the existing ledger under the target runtime, and provide a compatible recovery path before switching validators. The existing release-store, signed-source, runtime-parity, and browser-CORS gates still apply. These are concrete release prerequisites; SSH access and frontend build validation are complete.
