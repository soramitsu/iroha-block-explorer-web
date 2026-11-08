# Landing layout restoration — 2026-09-07

Roadmap: EX-319. The user's revised direction supersedes the compact overview, sidebar on home, and collapsed navigation decisions in EX-314. The preferred centered landing composition has been restored and published at https://taira-explorer.sora.org.

## Restored behavior

The landing layout follows the previously live `68ccf50f3944` composition: the 112px Iroha emblem and faint background mark, centered title, large 900px search, wrapping horizontal navigation, full-width statistics in two rows of three, and recent activity side by side at desktop widths or stacked on phones. The landing occupies the full viewport width, with node/scope, theme and language controls at the upper right. Inner pages retain their workspace layout.

Every primary navigation destination is visible. Group disclosure buttons and the navigation drawer were removed. Inner pages show all groups in the independently scrollable desktop sidebar, and all routes in an inline navigation below the toolbar on phones and tablets. Global versus scoped route behavior is unchanged.

The theme button shows a sun in light mode and a crescent with stars in dark mode. The 24px icons sit in controls of at least 44×44px, with a stable localized accessible name and pressed state. System defaults, manual preference persistence, native control color-scheme, and reduced motion remain intact.

Current search classification, clear/submit/help, persistent validation, telemetry availability/stale/retry states, collection validation, cursor semantics and transaction presentation are retained. Historical sample destinations and invented totals were not restored. All visible copy reuses existing shipped translations.

## Validation

- Exact Node 24.19.0 and pnpm 10.11.0: production build, typecheck, bundle budgets, roadmap and SDK pin checks pass.
- Source lint: zero errors and 1,428 existing/style warnings. Generated `output/**` assets were excluded from source lint; an initial unfiltered invocation attempted to lint archived minified distribution files.
- 28/28 hermetic Chromium browser checks pass, including 320/390/768/1200/1280/1440px, both native themes, Arabic RTL, German labels, scoped keyboard navigation, exact search, stale telemetry, and six-statistic layout. Desktop and mobile screenshots were visually reviewed independently.
- Final full unit suite: **149/149 files, 1,834 tests passed, one existing opt-in skip**.
- Theme integration tests cover both system defaults, system changes, both persisted overrides, toggling, and rapid-click guarding. Navigation tests cover all destinations and both presentation modes, active-route changes, scope preservation and forced-node isolation. Routing tests cover home/full-width versus inner-page wrapping and focus behavior.
- The old overview-layout expectation was updated to the restored layout. The final routing regression also waits for the existing async header component, matching the other route tests, so suite scheduling does not cause a false failure. This test-only adjustment does not change the published application artifact.

## Deployment and live evidence

Atomic cutover completed at **2026-09-07 03:40:24 UTC**, using the existing operator frontend deployment flow and nginx routing. Runtime configuration is unchanged and matches the independently verified live genesis. No Torii or nginx change was made.

- Release ID: `20260907T033901Z-landing-7c290ae4fe5d-operator`.
- Source: `dc9e64fdd002f9f3d22f69ee264cf998f343f3b0` plus recorded `landing-source.patch`, SHA-256 `7c290ae4fe5d23ea8f073d9287a68466c71dd5241329a67f7ac15d5a47350b50`.
- Archive SHA-256: `5e3a8c242bd5c6014cc78cdbef8b8bcd379f6a6d8a1c2d97ed33d2ac77c5ac4d`.
- Live index SHA-256: `141e2a2b8ca9f2498e27df1f63875dd77b15f3a71b82da359606c5c29747a026`.
- Public HTTPS verification: **191/191 files** match expected byte lengths and SHA-256 hashes.
- Unmocked live smoke: **18/18 checks pass**, with zero uncaught JavaScript, console, HTTP or script/CSS errors. Six live screenshots were reviewed in light/dark at 1280, 390 and 320px; no horizontal overflow or overlaps. Theme targets measure 46×46px. Search preservation/clear, keyboard navigation between Accounts/home, all visible links and manual theme persistence work. Twelve SSE cancellations correspond to deliberate navigations/reloads.
- Live telemetry displays 17 accounts, 14 assets, 7 domains, 7 blocks, 9 transactions and 4 nodes. EX-315 remains open for the existing recent-blocks/latest-transactions response-contract mismatches; the UI shows explicit error/Retry states.

The previous full directory is retained at `/Users/administrator/dev/iroha2-block-explorer-web/releases/pre-20260907T033901Z-landing-7c290ae4fe5d-operator`. The new root retains 320 non-conflicting old hashed assets for existing tabs. This remains an operator deployment, with `signedReleaseQualified: false`; it does not claim completion of the strict signed-release qualification.

Machine-readable deployment, HTTP inventory, test logs and live browser screenshots/reports are in `output/release-review/landing-20260907/`. The final routing-test patch is recorded separately from the immutable published artifact patch.
