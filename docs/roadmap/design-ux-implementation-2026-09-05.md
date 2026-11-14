# Explorer design and UX implementation — 2026-09-05

Roadmap: EX-314 — completed. Implements the approved plan following the [design review](design-ux-review-2026-09-05.md). Deployment is outside this change.

## Completed implementation

- Grouped 240px desktop sidebar from 1200px, shared overview/inner-page shell, independently scrollable navigation, and a native modal drawer with focus wrapping, Escape dismissal, focus restoration, and closure after navigation. Overview and the logo retain node/dataspace scope. Existing global inventory-route boundaries remain authoritative.
- Persistent labeled search form with visible submit, accessible clear, help disclosure, strict identifier classification, and retained input on invalid or failed navigation. Removed sample destinations and duplicate homepage navigation.
- Compact overview, current node context, six telemetry totals, and recent blocks/transactions beside each other when space permits. Disconnected retained telemetry is explicitly stale; Retry reopens its current SSE connection independently of failover.
- Shared collection states around Accounts, Domains, Blocks, all Assets tabs, Transactions, Instructions, and latest activity. Loading, true empty, filtered empty/reset, initial failure/retry, and stale refresh are distinct. Failed initial reads expose neither pagination nor zero-record claims; empty cursor pages retain their recovery controls. Validated live transactions remain visible during a slow or failed initial list read.
- Container-sized tables with a 960px default and preserved explicit dense-table thresholds; identifiers shorten to the workspace. Native copy and disclosure actions have 44px targets, names, keyboard operation, and visible clipboard rejection feedback. Timestamp explanations work with focus, click/tap, hover, and Escape.
- Solid light/dark surfaces, 8px controls and 12px structural panels, restrained red, clearer text, visible focus, and reduced-motion behavior. Both system defaults and persistent manual theme selection are preserved; native control color scheme follows the active theme. The Iroha wordmark remains readable in dark mode.
- Transaction status/rejection precedes a bounded first-three instruction preview from the current endpoint and existing validated presentation registry. Evidence identities are checked, pagination indicates more instructions, rejected actions stay requested, and multisig nested actions stay proposed. Nonce, metadata, signature, and TTL are in a native technical disclosure. Contract views and raw evidence remain accessible. Copied instruction links preserve scope, and superseded or closed detail requests cannot overwrite the active selection.
- All 36 new strings translated in all 25 shipped non-English catalogs (900 translations). Existing ancient research seeds gained only unreviewed new records; their runtime exclusion and qualification requirements remain intact. Font glyph subsets, binaries, and licenses are unchanged; source provenance hashes track the extended seeds.

## Validation evidence

- Exact Node 24.19.0 and pnpm 10.11.0. Initial commands used the repository bootstrap. When registry DNS/downloads failed, later checks reused its verified Node extraction and the cached pnpm artifact with the exact recorded integrity hash. No toolchain or production compatibility path was changed.
- Full unit run: 147 files, 1,793 passed, one existing intentional skip, including final scope/share-link/late-response coverage. The completed run used `pnpm exec vitest run --pool=forks --maxWorkers=4 --testTimeout=120000` (37.79s). A previous threaded run stalled under host load; no repository timeout changes were made.
- Typecheck, lint (no errors; existing formatting warnings remain), production build, bundle budgets, localized-copy checks, locale schema/placeholder/canonical-literal checks, and roadmap validation passed.
- All 28 final hermetic browser cases passed across desktop and mobile (22.9s), including six-value telemetry/disconnect, scoped home/logo navigation, identifier targets/disclosure, instruction tabs and panel overflow, exact search, cursor keyboard behavior, Studio workflow, and authentication boundaries. Responsive review covers 320, 390, 768, 1200, 1280, and 1440px in both themes, plus Arabic RTL and German long labels. Both activity headings and first rows or state messages fit at 1280×720, including the statistics/stale notice.
- Core token contrast checks: light labels 6.97:1, links/focus 6.75:1, essential borders 3.95:1; dark labels 7.81:1, links/focus 7.28:1, borders 4.54:1. Selected states are 5.97:1 light and 6.77:1 dark. These are targeted token checks, not a claim of a complete accessibility certification.
- Screenshots from the hermetic tests are retained under `output/playwright/test-results/`, including overview light/dark at the required widths, statistics/disconnection, Arabic/German drawers, and transaction details on desktop/mobile.

## Read-only live-node check

Bounded public Taira GETs succeeded after a temporary DNS outage:

- Accounts returned the current cursor response with one record, `limit: 1`, and `has_more: true`.
- Blocks returned legacy numbered pagination (`page`, `per_page`, `total_pages`, `total_items`) instead of the required snapshot/cursor contract.
- Latest transactions returned nine records and `sampled_at` but omitted the required pagination envelope.

The strict Explorer contracts correctly reject the latter incompatible collection responses. No fallback was introduced. Public-node contract qualification/rollout is recorded separately as EX-315; deployment remains outside this frontend change.
