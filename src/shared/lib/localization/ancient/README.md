# Scholarly reconstructed ancient locales

`akk.source.json` is restricted to the Sargonic stage of Old Akkadian. `egy.source.json` is scoped for review against
Classical Middle Egyptian. Each record keeps UI context, a candidate ancient-script message, transliteration, literal
back-translation, modern interpretation, constituent-level evidence, attestation tier, construction rationale, and two
independent project review passes.

The checked-in schema-v2 files are review seeds, not approved translations. They must not be copied into a visible
catalog or described as attested ancient language. Old Akkadian constituents are restricted to a finite inventory of
MAD3 headwords with exact printed-page locators; their cuneiform metadata distinguishes directly attested logograms or
spellings from explicitly reconstructed normalized syllabic citation forms. Whole UI expressions are modern paratactic
reconstructions whose middle dot is interface punctuation, not claimed Old Akkadian syntax. Whole Egyptian UI
expressions are also modern paratactic interface reconstructions: the middle dot is modern punctuation, not Egyptian
syntax. The seed is restricted to 18 candidate lexical constituents with exact TLA lemma URLs; it contains no phrase-,
clause-, inflection-, word-order-, corpus-attestation-, or grammar-construction claims. Those lemma locators do not by
themselves verify Classical Middle Egyptian period fit or the displayed Unicode spelling. The hieroglyph strings
contain no Egyptian format controls, make no quadrat-layout claim, and give classifiers no independent picture-word
meaning. Every record citation and both human review passes remain pending. Inspect the machine-readable blocker count
with:

```sh
node scripts/generate-ancient-locales.mjs --report
```

Runtime generation succeeds only after every source locator has been project-verified, every protected literal has
been reviewed, the semantic-forward and blind back-translation passes have different named human reviewers, and the
manifest itself is marked `project-reviewed`. `--check` applies the same gate before checking deterministic runtime
JSON. A rejected generation never modifies either runtime file.

Regenerating source seeds discards all reviews and therefore requires an explicit acknowledgement:

```sh
node scripts/generate-ancient-locales.mjs --seed-manifests --reset-reviews
```

Reconstructed interface sequences are never represented as ancient attestations. Placeholder parity includes both
Vue interpolation tokens such as `{count}` and Blockly socket tokens such as `%1`.
