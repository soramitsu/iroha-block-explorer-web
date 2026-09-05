# Explorer design and UX critique — 2026-09-05

The Explorer has a recognizable Iroha identity and useful shared components, but its hierarchy gives navigation and decorative surfaces too much attention. The most consequential problems are mobile access to the working content, search availability, and honest presentation of failed reads.

This is a critique, not an implementation change. Priorities below express recommended order, not completed fixes.

## Review scope and evidence

- Rendered the current working tree using the repository's exact Node 24.19.0 / pnpm 10.11.0 development bootstrap.
- Inspected the homepage and Accounts at 1280×720 and 390×844, plus Accounts, Transactions, Blocks, and an asset example at 1440×1000. Inspected both themes.
- First used the default development configuration with its unavailable local Torii target to inspect real connection-failure behavior. Then used the documented development proxy pointed at the public Taira origin. The live account list and homepage totals loaded. The homepage asset example returned “Asset definition not found.”
- Transaction browsing displayed “No data”; this review did not establish whether that live response reflected an empty collection or a contract/request failure. The local unavailable-node Accounts case independently establishes the error-presentation defect.
- Reviewed navigation, search, shared identifiers/tables, and transaction detail source independently. Transaction detail recommendations below are source-based; a populated transaction detail was not visually validated.
- Consulted the current capability matrix and roadmap. Recommendations preserve canonical identifiers, authoritative instruction evidence, strict Norito contracts, cursor semantics, and protected-route boundaries. No mock data, alternate codecs, or fallback routes were introduced.
- This was a manual design review, not a complete screen-reader audit, contrast measurement, locale audit, or release qualification.

## 1. High priority: mobile navigation consumes the working viewport

At 390×844, the inner-page header occupied approximately 510 pixels before Accounts began. Nineteen equally prominent navigation links wrap into nine rows. Even on desktop, the header takes two or three navigation rows depending on width. Blocks and Transactions compete with specialist destinations such as Kotodama Studio, Soracles, VPN, and ZK Registry.

Keep core exploration visible, group specialist destinations by user task, and use a compact mobile menu. An initial structure could prioritize Blocks, Transactions, Accounts, and Assets, with grouped Network and Developer destinations. Group labels should be checked against actual audiences and capabilities.

Evidence: `src/shared/config.ts:1`, `src/features/navigation/NavigationMenu.vue:3`, `src/features/navigation/NavigationMenu.vue:30`, `src/widgets/header/TheHeader.vue:48`.

## 2. High priority: global search disappears on smaller screens

The inner-page search is hidden below 1200px, with no replacement search control in that header. This is a central Explorer action: someone following a deep link on a phone should be able to look up another account or transaction immediately.

Keep a search field or an explicit search button on every route and viewport. A compact overlay can preserve working space on phones.

Evidence: rendered 390px Accounts screen; `src/widgets/header/TheHeader.vue:114`; `src/shared/ui/styles/breakpoints.scss:3`.

## 3. High priority: failed reads look like valid empty results

With the default local Torii port unavailable, Accounts showed “No data” and “0 rows on this page; exact total unavailable,” with disabled pagination but no error explanation or retry. The source converts unsuccessful list reads into an empty array; the shared table renders the same state used for an empty result. Domains and Transactions have the same source pattern.

Provide distinct loading, successful-empty, filtered-empty, and failed states. A failure should explain that the data could not be loaded and offer retry. Show the selected node as useful recovery context. If retaining previous valid results after a failed refresh, explicitly mark them stale and clear them when node, scope, or filters change. Do not invent data or relax contract validation.

The homepage also renders six prominent “unknown” values when telemetry is unavailable. Replace repetition with a compact availability explanation and a clear recovery path.

Evidence: `src/pages/AccountsList.vue:172`, `src/pages/AccountsList.vue:179`, `src/pages/DomainsList.vue:117`, `src/shared/ui/components/TransactionsTable.vue:252`, `src/shared/ui/components/BaseTable.vue:11`, `src/widgets/home-page-info/HomePageInfo.vue:25`.

## 4. Medium priority: search guidance adds friction and leads to dead ends

The large placeholder is clipped even on desktop and includes “canonical halfwidth i105” and “Base58.” The accessibility tree names the field “basic-search-24,” inherited from the icon, rather than a useful search label. Submission depends on Enter; there is no visible submit button. Unsupported input produces a transient notification instead of persistent guidance next to the field.

The “Try a…” chips immediately navigate to hardcoded entities. On the public Taira node, the `usd#issuer.main` example led to “Asset definition not found.” The transaction chip displays `0xabc123…` but searches a different hardcoded hash.

Use a short accessible label, concise placeholder, explicit submit affordance, and persistent inline validation. Put detailed identifier syntax in expandable help. Examples should either populate an editable syntax example or use an actual entity returned by the selected node.

Evidence: rendered homepage and asset example; `src/features/search/SearchField.vue:2`, `src/features/search/SearchField.vue:48`, `src/pages/HomePage.vue:73`, `src/shared/lib/localization/en.json:107`.

## 5. Medium priority: the homepage delays useful chain activity

At 1280×720, the logo, large title, search examples, and navigation occupy almost the entire first viewport. Neither latest block rows nor latest transaction rows are visible. Returning users must scroll before they can monitor activity.

Retain the distinctive Iroha mark, but compress the branding area. Organize the initial viewport around search, clear network/availability context, a compact statistics strip, and the beginning of recent activity. Use the same navigation hierarchy on home and inner pages.

Evidence: rendered desktop homepage; `src/pages/HomePage.vue:14` through the activity composition at line 47.

## 6. Medium priority: decorative surfaces weaken reading and affordances

Rounded containers, inset shadows, red glows, layered gradients, and raised controls appear throughout routine data views. The visual weight sits heavily in the header; page headings and filter labels look much lighter. Light-mode labels and controls are visibly pale, though this review did not measure contrast ratios.

Shared content panels also animate a sheen indefinitely and lift on hover, even when the panel itself is not a single clickable object. This gives structural containers an action affordance and adds movement around data users are reading.

Use flatter neutral surfaces, stronger text contrast, simpler dividers, and fewer radius sizes. Reserve accent color and motion for meaningful selection, actions, and status. Remove hover movement from noninteractive containers. Preserve the Iroha palette and typography while reducing surface effects.

Evidence: rendered Accounts/Transactions in light mode and Accounts/home in dark mode; `src/shared/ui/components/BaseContentBlock.vue:34`, `src/shared/ui/components/BaseContentBlock.vue:67`, `src/shared/ui/components/BaseContentBlock.vue:79`, `src/widgets/header/TheHeader.vue:67`.

## 7. Medium priority: identifier controls need accessible names and larger targets

The loaded account list exposes each copy icon as an unnamed button. `BaseHash` implements it as a focusable 16×16 SVG with no accessible label and no enlarged hit area. This makes a frequent Explorer action harder for touch and screen-reader users.

Use native labeled buttons, provide a comfortably sized hit target, preserve copy confirmation, and support keyboard/tap access to full truncated values. Review hover-only timestamp explanations in the same pass.

Evidence: rendered Accounts accessibility tree; `src/shared/ui/components/BaseHash.vue:11`, `src/shared/ui/components/BaseHash.vue:144`, `src/shared/ui/icons/copy.svg:1`, `src/pages/TransactionDetails.vue:208`.

## 8. Medium priority, source-based: transaction detail needs an action summary

The detail template presents hash, timestamp, status, authority, nonce, block, metadata, and signature before the Instructions section. Status is already present, but the page lacks an introductory explanation of the transaction's action.

Lead with outcome and a concise summary derived strictly from supported authoritative instruction evidence, with participants and amounts where available. Keep technical fields accessible in an expanded details area. Where the evidence cannot support a summary, say what is known rather than inferring behavior.

Evidence: `src/pages/TransactionDetails.vue:194`, `src/pages/TransactionDetails.vue:233`, `src/pages/TransactionDetails.vue:256`. Perceived reading cost is a design inference from source order.

## Strengths to retain

- The Iroha emblem and red accent make the product recognizable.
- Search has a prominent position on the homepage.
- Account links and count columns are easy to scan once the table is reached.
- The app already contains a skip link, route-change focus management, reduced-motion support, mobile entity presentations, and scoped navigation.
- Detail resource states already distinguish not-found and failed loads, providing a useful pattern for fixing list states.
- Existing protections against shifting transaction rows while users scroll should survive the redesign.

Recommended sequence: repair mobile navigation/search and failed-list states first; simplify homepage/search guidance next; then refine contrast, surfaces, identifier controls, and transaction summaries.
