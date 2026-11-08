# Taira transaction layout repair — 2026-09-12

Published `20260912T064954Z-layout-f6c27bbda414-operator` to
https://taira-explorer.sora.org after DPN released its bounded frontend publication
window. The previous data-loading recovery remains included.

The transaction widget reserved 32 pixels for a status component that had grown
to 84 pixels after gaining an adjacent information button. That button overlapped
the timestamp. Rows also combined large padding, stacked metadata, and redundant
disclosure buttons beside identifiers that already linked to full details.

The status badge now has one accessible 44-pixel button around its 32-pixel icon.
It supports pointer, keyboard and touch interaction with Escape dismissal. The
transaction hash occupies the primary line; the account and timestamp share the
secondary line when space permits and wrap at narrow widths. Linked identifiers
retain full-value titles and copy controls without a second disclosure button.
Unlinked identifiers retain explicit full-value disclosure.

The icon build also used SVGO's retired `active: false` syntax, which actually
ran `removeViewBox`. Preserving authored view boxes fixes clipping when icons
are resized. The clock selector now targets only the clock rather than every
nested SVG, so it no longer restyles the timestamp information icon.

## Verification

- Maintained source: 161 test files, **1,576 passed**, one existing opt-in skip.
  Typecheck, build, lint with zero errors, and bundle budgets pass on Node
  24.19.0 / pnpm 10.11.0. The desktop/mobile browser matrix passes **16/16**.
- Published-source build: production build/typecheck, lint and bundle budgets
  pass; 23 focused component tests and 55 SVG/build-configuration tests pass.
- Actual public browser: all five transaction rows stay within their containers
  without overlapping status, hash, account or timestamp at 320, 390, 768 and
  1440 pixels, in light and dark themes. Copy and keyboard tooltip interactions
  pass. Rows measure 113 pixels on desktop and at most 145 pixels on narrow
  screens, including the touch controls.
- The operator publisher verified all **192 public files** against their hashes.
  The config and SDK chunk are byte-identical to the previous release. Nginx's
  pre/post SHA-256 remains
  `3f634e2fa99e790b9ff6fb2c1101a4bb2d1178a13724488128e086728e8bb03f`.
  No service reload, validator, ledger or native-runtime mutation occurred.

Release provenance is in public `release.json` and local
`output/taira-layout-20260912/prepared-release.json`. The complete source patch
against `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0` has SHA-256
`f6c27bbda414defcbf36fd26cf1e23fa094573ee7896536efc1bef47b0eba17d`;
it includes the original landing and data-recovery changes. The publication
archive SHA-256 is
`37df5e0a3d5b9cf407b2197a70279a870af3fbd3158e9b69f4fc221432630c65`.
This is still the explicitly unqualified operator release, preserving native
runtime `53ba8d70bddc3c2a6299bd4df5a6412207772c87` and SDK
`16866ffbe8406c7565548d0be8110209b8cba2bc`.

Screenshots, actual DOM geometry, public read checks, gate logs, rollback location
and publication receipt are retained in `output/taira-layout-20260912/`.

## Coordinated transport integration

The maintained checkout also integrates the reviewed transport handoff from
BPNG: caller cancellation reaches the request and response body; one deadline
covers retries, backoff, headers and body consumption; only unsigned read
requests can be retried; signed requests are never replayed. There are 150
focused transport/API/adapter checks. The full test run also exposed an existing
bootstrap-test race, fixed by awaiting the complete dynamic-import chain before
resetting mocks, with a deferred-import regression. Production startup is
unchanged. Generated output is now excluded from source linting.

These transport changes are local to the maintained source and were not added
to this UI-only operator artifact. The canonical browser codec's startup and
SDK/release integration remain pending the native owner's qualified artifact;
partial Wasm initialization evidence does not qualify that release.
