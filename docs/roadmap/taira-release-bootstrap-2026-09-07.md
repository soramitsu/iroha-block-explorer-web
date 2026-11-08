# Taira release bootstrap and deployment attempt — 2026-09-07

> Deployment update: the operator frontend cutover completed on September 7 after renewed user authorization. See [deployment evidence](taira-operator-deployment-2026-09-07.md). The preflight results below are historical and the strict qualification gaps remain recorded.

Roadmap: EX-318 completed; EX-316 deployment remains blocked by live release prerequisites. This continues the [validated candidate and backup](taira-release-candidate-dc9e64f-2026-09-06.md).

## Fixed and verified

The current release entry point imported `NetworkId` from `@iroha/iroha-js` before source verification or dependency installation. Running the supported wrapper from a newly staged checkout reproduced `ERR_MODULE_NOT_FOUND`, even though the exact-toolchain bootstrap succeeded.

Removed the eager package import. The operator config still must equal the single reviewed canonical Taira NetworkId exactly. That comparison already rejects other networks, malformed values, whitespace, lowercase aliases, invalid checksums, and non-string values. No protocol codec, compatibility branch, signer bypass, runtime override, or CORS exception was introduced.

Regression coverage now copies the five required source modules into a temporary checkout with no `node_modules`, loads the release tool in a new Node process, validates the reviewed config, and confirms that an unattested direct CLI invocation still fails. Additional cases cover the exact literal and ten invalid identity forms.

Exact Node 24.19.0 / pnpm 10.11.0 validation:

- Release-tool, exact-toolchain, and node-version suites: 148 passed, one existing opt-in skip; all three suites passed in 8.63 seconds.
- Focused lint: zero errors, 17 existing warnings.
- Independent review confirmed that the unchanged NetworkId literal is accepted by the pinned SDK, with the same strict configuration acceptance set.
- Scoped diff checks and roadmap integrity pass.

Logs and the reviewable patch are retained under `output/release-review/dc9e64fdd002/bootstrap-fix/`. The application itself is unchanged from the candidate that passed 1,814 unit tests and 28 browser cases, including native light/dark behavior.

## Deployment-host preparation

Created a private preparation directory, separate from the live root:

```text
/Users/administrator/dev/explorer-release-preparation/dc9e64fdd002
```

The exact committed source was transferred as a complete Git bundle with SHA-256 `4361a3dcfd054d98180997e40617a4bfd51d1db01608e8be4235a244f23b62e9`. The bundle was verified before cloning; the resulting detached checkout initially matched `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0` cleanly, with the canonical public origin configured. The host's checked-in bootstrap successfully verified Node 24.19.0 and pnpm 10.11.0.

The EX-318 module fix was then applied only to that private qualification checkout. Its SHA-256 is `3b1c796583fd6d85cfce3e161180d2e15ff87d1100168212d245da3017765d1b`, matching the local file. This qualification overlay is uncommitted and is not claimed to be signed canonical release source.

Captured the actual successful `sudo nginx -T` output in the private preparation directory as an owner-only file. Its potentially sensitive configuration remains on the deployment host. The saved password was supplied only to the authorized SSH/sudo processes and was not placed in command arguments, logs, or this repository.

The supported `ops/taira/deploy-explorer.sh verify` command now loads successfully and reaches the nginx gate. It exits with:

```text
nginx HTTP redirect block for taira-explorer.sora.org must listen only on IPv4/IPv6 port 80
```

The actual shared HTTP vhost has `listen 80` but no `[::]:80` listener. The previously audited proxy-rich TLS vhost, legacy release directory, missing canonical manifests, runtime mismatch, and failed CORS checks also remain. A direct supported deployment attempt is recorded in `release-deploy-fixed.log` in the same private directory; no cutover has occurred.

## Remaining external prerequisites

The trusted signer is the personal OpenPGP key for `t@soramitsu.co.jp`, fingerprint `9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB`. No usable signing setup was found in the inspected local or deployment-account Git/GPG configuration, installed signing tools, keyring locations, or relevant accessible credential files. Protected local application directories were not bypassed. The key was not replaced, forged, or exported.

The live Torii revision remains `b1da38607524a44f5a55e0a89a171004744a3bd7`; the candidate still pins `16866ffbe8406c7565548d0be8110209b8cba2bc`. The earlier source/genesis/ledger compatibility gap remains unqualified. Publishing requires trusted signed source and a coordinated, verified runtime/edge/release-store migration; the Explorer request does not supply missing signing material or evidence for a safe ledger transition.

The existing live Explorer, nginx serving configuration, and Torii processes remain unchanged. The verified private rollback backup from September 6 is retained.
