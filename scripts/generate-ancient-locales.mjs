import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALIZATION_ROOT = resolve(REPOSITORY_ROOT, 'src/shared/lib/localization');
const ANCIENT_ROOT = resolve(LOCALIZATION_ROOT, 'ancient');
const ENGLISH_PATH = resolve(LOCALIZATION_ROOT, 'en.json');

const SOURCE_PATHS = {
  akk: resolve(ANCIENT_ROOT, 'akk.source.json'),
  egy: resolve(ANCIENT_ROOT, 'egy.source.json'),
};

const RUNTIME_PATHS = {
  akk: resolve(LOCALIZATION_ROOT, 'akk.json'),
  egy: resolve(LOCALIZATION_ROOT, 'egy.json'),
};

const PROTECTED_FULL_KEYS = new Set([
  'homePage.title.firstLine',
  'homePage.search.samples.tx',
  'homePage.search.samples.account',
  'homePage.search.samples.asset',
  'homePage.search.samples.nft',
  'homePage.search.samples.rwa',
  'transactions.setKeyValue',
  'transactions.removeKeyValue',
  'transactions.executeTrigger',
  'transactions.setParameter',
  'transactions.filters.authorityPlaceholder',
  'contracts.filters.contractAddressPlaceholder',
  'contracts.filters.contractAliasPlaceholder',
  'dataspaces.accountLiteralPlaceholder',
  'accounts.filters.domainPlaceholder',
  'assets.filters.ownerPlaceholder',
  'assets.filters.domainPlaceholder',
  'accounts.filters.assetPlaceholder',
  'econometrics.assetPlaceholder',
  'soracloud.nav',
  'soracloud.serviceNamePlaceholder',
  'soracloud.jobIdPlaceholder',
  'soracloud.modelNamePlaceholder',
  'soracloud.weightVersionPlaceholder',
  'soracloud.sessionIdPlaceholder',
  'soracloud.repoIdPlaceholder',
  'soracloud.storageClassPlaceholder',
  'soracloud.leaseTermPlaceholder',
  'soracloud.apartmentPlaceholder',
  'soracles.nav',
  'soracles.title',
  'studio.nav',
]);

const PROTECTED_TOKEN_PATTERN =
  /(?:`[^`]+`|https?:\/\/[^\s]+|\/[a-z0-9_{}*./:-]+|\{[^{}]+\}|%\d+|--[a-z0-9][a-z0-9-]*|0x(?:[a-fA-F0-9]+|…+)?|X-[A-Za-z0-9-]+|[A-Za-z0-9][A-Za-z0-9_.-]*(?:[@#$][A-Za-z0-9*{}.…_-]+|:(?:\.{3}|[A-Za-z0-9*{}…_-]+))|[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*)+|Hyperledger Iroha|IrohaConnect|Iroha|OperatorSigningContext|NetworkId|Explorer|Diagnostic|Prometheus|Torii|Norito|SoraFS|SoraCloud|Soracles|DeFi|KAIGI|Kotodama|Nexus|WebAuthn|Base58|[iI]105|UAID|CIDR|HPKE|NPoS|WASM|JSON|SSE|TLS|HTTP\(S\)|HTTP|API|CID|CAR|NFTs?|RWA|QR|RBC|VRF|PRF|QC|DA|DvP|PvP|FX|ABI|HSM|VPN|BLS|AMX|[A-Z]{2,}(?:-[A-Z0-9]+)*|[0-9]+(?:\.[0-9]+)?(?:ms|s)?)/gu;

const PLACEHOLDER_PATTERN = /(?:\{[^{}]+\}|%\d+)/gu;
const AUTOMATED_REVIEWER_PATTERN = /(?:auto(?:matic)?|bot|chatgpt|codex|generator|language model|machine|openai)/iu;
const PLACEHOLDER_REVIEWER_PATTERN =
  /^(?:(?:blind|evidence|forward|human|independent|literal|primary|project|secondary|semantic)\s+)*(?:reviewer|translator|expert|scholar|project|team|staff|human)(?:\s*\d+)?$/iu;
const PLACEHOLDER_REVIEW_NOTE_PATTERN =
  /^(?:ok|approved|reviewed|verified|pass(?:ed)?|project[- ]approved|n\/?a|not applicable)[.!]?$/iu;
const PROVISIONAL_EVIDENCE_PATTERN =
  /(?:candidate|to be verified|unverified|supporting\s+\S+$|search for|phrase and classifier attestations)/iu;
const COMMON_RUNTIME_CHARACTER_PATTERN = /[\p{P}\p{Zs}0-9+\u00B1\u00D7\u2212=<>%&@#$*|~^]/gu;
const EGYPTIAN_FORMAT_CONTROL_PATTERN = /[\u{13430}-\u{1345F}]/u;
const EGYPTIAN_BASE_SIGN_PATTERN = /[\u{13000}-\u{1342F}]/u;
const EVIDENCE_ROLE_SOURCES = {
  akk: {
    'lexical-constituent': ['MAD3'],
    'grammar-construction': ['MAD2'],
    'corpus-attestation': ['MAD3'],
    'contextual-comparison': ['CAD'],
  },
  egy: {
    'lexical-constituent': ['TLA-LEMMA', 'TLA-CORPUS'],
    'grammar-construction': ['TLA-CORPUS'],
    'corpus-attestation': ['TLA-CORPUS'],
    'unicode-encoding': ['UNICODE17-11'],
  },
};
const ATTESTATION_SOURCES = { akk: 'MAD3', egy: 'TLA-CORPUS' };

const EVIDENCE = {
  akk: [
    {
      sourceId: 'MAD2',
      title: 'Old Akkadian Writing and Grammar',
      url: 'https://isac.uchicago.edu/sites/default/files/uploads/shared/docs/mad2.pdf',
      locator: 'pp. 20–118, 137–170, 218–235',
      support: 'Sargonic sign values, syllabic spelling, construct state, case, mimation, and verbal morphology.',
    },
    {
      sourceId: 'MAD3',
      title: 'Glossary of Old Akkadian',
      url: 'https://isac.uchicago.edu/research/publications/mad/mad-3-glossary-old-akkadian',
      locator: 'lexical entries and cited Sargonic sources',
      support: 'Period vocabulary and attestations; modern compounds use only cited constituents.',
    },
    {
      sourceId: 'CAD',
      title: 'Chicago Assyrian Dictionary',
      url: 'https://isac.uchicago.edu/research/publications/chicago-assyrian-dictionary',
      locator: 'comparative entries only',
      support: 'Diachronic comparison; later forms are not imported as Sargonic attestations.',
    },
  ],
  egy: [
    {
      sourceId: 'TLA-CORPUS',
      title: 'Thesaurus Linguae Aegyptiae text corpus',
      url: 'https://thesaurus-linguae-aegyptiae.de/info/text-corpus',
      locator: 'Middle Egyptian corpus attestations',
      support: 'Classical Middle Egyptian lexical and constructional context.',
    },
    {
      sourceId: 'TLA-LEMMA',
      title: 'Thesaurus Linguae Aegyptiae lemma lists',
      url: 'https://thesaurus-linguae-aegyptiae.de/info/lemma-lists',
      locator: 'Egyptian lemma spellings and meanings',
      support: 'Consonantal lemma spellings and lexical meanings; no vowels are supplied.',
    },
    {
      sourceId: 'UNICODE17-11',
      title: 'Unicode 17.0 Core Specification, Chapter 11',
      url: 'https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-11/',
      locator: 'Egyptian Hieroglyphs and format controls',
      support:
        'Unicode encoding and quadrat controls. Classifiers constrain lexical readings and are never translated as independent picture-words.',
    },
  ],
};

const TLA_LEMMAS = {
  bring: {
    lemmaId: '26870',
    lemma: 'jni̯',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/26870',
    support: 'to bring; to fetch',
  },
  choose: {
    lemmaId: '148070',
    lemma: 'stp',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/148070',
    support: 'to pick out; to choose',
  },
  command: {
    lemmaId: '51980',
    lemma: 'wḏ.w',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/51980',
    support: 'command; decree',
  },
  do: {
    lemmaId: '28550',
    lemma: 'jri̯',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/28550',
    support: 'to do; to make; to create',
  },
  know: {
    lemmaId: '95620',
    lemma: 'rḫ',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/95620',
    support: 'to know; to learn',
  },
  land: {
    lemmaId: '168860',
    lemma: 'tꜣ',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/168860',
    support: 'earth; land; ground',
  },
  messenger: {
    lemmaId: '45760',
    lemma: 'wpw.tj',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/45760',
    support: 'messenger',
  },
  name: {
    lemmaId: '94700',
    lemma: 'rn',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/94700',
    support: 'name',
  },
  negative: {
    lemmaId: '84550',
    lemma: 'nn',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/84550',
    support: 'Middle Egyptian negative word; there is not',
  },
  reckon: {
    lemmaId: '109870',
    lemma: 'ḥsb',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/109870',
    support: 'to count; to reckon; to distribute',
  },
  remove: {
    lemmaId: '180130',
    lemma: 'dr',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/180130',
    support: 'to drive away; to repel; to remove',
  },
  repeat: {
    lemmaId: '48440',
    lemma: 'wḥm',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/48440',
    support: 'to repeat',
  },
  seal: {
    lemmaId: '121690',
    lemma: 'ḫtm',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/121690',
    support: 'seal; sealing; sealing cylinder',
  },
  see: {
    lemmaId: '66270',
    lemma: 'mꜣꜣ',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/66270',
    support: 'to see; to look',
  },
  treasury: {
    lemmaId: '60780',
    lemma: 'pr-ḥḏ',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/60780',
    support: 'treasury',
  },
  trueAdjective: {
    lemmaId: '66460',
    lemma: 'mꜣꜥ',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/66460',
    support: 'just; correct; true',
  },
  truth: {
    lemmaId: '66620',
    lemma: 'mꜣꜥ.t',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/66620',
    support: 'right order; truth',
  },
  writing: {
    lemmaId: '450097',
    lemma: 'zẖꜣ.w',
    url: 'https://thesaurus-linguae-aegyptiae.de/lemma/450097',
    support: 'writing; record; depiction',
  },
};

// eslint-disable-next-line max-params -- each term keeps its hieroglyphs, reading, gloss, and TLA locator adjacent
function egyptianTerm(script, transliteration, meaning, lemmaKeys) {
  return [
    script,
    transliteration,
    meaning,
    {
      constructionStatus: 'attested-lexeme',
      classifierSemanticContribution: 'none',
      lexicalEvidence: lemmaKeys.map((key) => TLA_LEMMAS[key]),
    },
  ];
}

// The cuneiform strings below are dictionary citation forms, not claims that the
// complete UI formula occurs in an ancient text. Logograms are used only where
// MAD3 explicitly records them; otherwise the normalized headword is rendered
// syllabically with the period sign inventory and marked as such for review.
// eslint-disable-next-line max-params -- each reviewed headword keeps its script, gloss, locator, and rendering claim together
function akkadianTerm(script, transliteration, meaning, locator, support, scriptRendering) {
  return [
    script,
    transliteration,
    meaning,
    {
      constructionStatus: 'attested-lexeme',
      scriptRendering,
      lexicalEvidence: [{ sourceId: 'MAD3', locator, support }],
    },
  ];
}

const AKKADIAN_LEXEMES = {
  amārum: akkadianTerm(
    '𒀀𒈠𒊒𒌝',
    'amārum',
    'to see; to inspect',
    'MAD3 p. 46, ʾMR amārum “to see, to inspect”',
    'The entry includes Sargonic witness formulae with i-mu-ru and e-mu-ru.',
    'reconstructed-normalized-syllabic-citation'
  ),
  apāšum: akkadianTerm(
    '𒀀𒉺𒋗𒌝',
    'apāšum',
    'to make',
    'MAD3 p. 57, ʾPŠ apāšum “to make”',
    'The entry cites Old Akkadian finite spellings including e-bí-iš and i-bu-uš.',
    'reconstructed-normalized-syllabic-citation'
  ),
  awātum: akkadianTerm(
    '𒀀𒉿𒀜𒌝',
    'awātum',
    'word',
    'MAD3 p. 2, ʾWY awātum “word”',
    'The headword is attested in the Old Akkadian glossary; no later decree sense is imported.',
    'reconstructed-normalized-syllabic-citation'
  ),
  biʾārum: akkadianTerm(
    '𒁉𒀀𒊒𒌝',
    'biʾārum',
    'to choose',
    'MAD3 p. 91, BʾR baʾārum or biʾārum “to choose”',
    'The entry cites Old Akkadian i-bi-ru “whom … has chosen” and bi-ru “selected.”',
    'reconstructed-normalized-syllabic-citation'
  ),
  bītum: akkadianTerm(
    '𒂍',
    'bītum',
    'house; estate',
    'MAD3 pp. 92–93, BʾT bītum “house, estate”',
    'MAD3 states that the word is written logographically or syllabically and documents É for the estate sense.',
    'attested-logogram'
  ),
  kanākum: akkadianTerm(
    '𒅗𒈾𒆪𒌝',
    'kanākum',
    'to seal',
    'MAD3 p. 147, KNK kanākum “to seal”',
    'The entry cites the Old Akkadian finite spelling li-ik-nu-ku.',
    'reconstructed-normalized-syllabic-citation'
  ),
  kīnum: akkadianTerm(
    '𒁴',
    'kīnum',
    'established; regular; firm; well',
    'MAD3 p. 138, KʾN kīnum “established, regular, firm, well”',
    'MAD3 states that the adjective is written logographically or syllabically; MAD2 p. 103 gives the GIM/DIM sign the value kīn.',
    'attested-logogram'
  ),
  mātum: akkadianTerm(
    '𒈠𒁕',
    'mātum',
    'land; country',
    'MAD3 p. 168, MʾT mātum “land, country”',
    'MAD3 explicitly documents the logographic spelling MA.DA alongside KALAM and syllabic spellings.',
    'attested-logogram'
  ),
  nasāḫum: akkadianTerm(
    '𒈾𒊓𒄷𒌝',
    'nasāḫum',
    'to tear out',
    'MAD3 p. 205, NSḪ nasāḫum “to tear out”',
    'The Old Akkadian glossary supplies the period lexeme; “remove” is the stated modern semantic extension.',
    'reconstructed-normalized-syllabic-citation'
  ),
  šiprum: akkadianTerm(
    '𒋛𒅁𒊒𒌝',
    'šiprum',
    'message; command; messenger',
    'MAD3 p. 281, ŠPR šiprum “message, command, messenger”',
    'The entry distinguishes ši-ip-ri “command/order” from ši-bi-ir “messenger”; the displayed infinitive is explicitly reconstructed.',
    'reconstructed-normalized-syllabic-citation'
  ),
  šumum: akkadianTerm(
    '𒈬',
    'šumum',
    'name; male progeny',
    'MAD3 p. 273, ŠM šumum “name, (male) progeny”',
    'MAD3 states that the word is written logographically or syllabically and cites MU for “name.”',
    'attested-logogram'
  ),
  ṭuppum: akkadianTerm(
    '𒁾',
    'ṭuppum',
    'tablet; inscription',
    'MAD3 p. 298, ṬP ṭuppum “tablet, inscription”',
    'MAD3 explicitly states that the word is written logographically DUB, with or without phonetic indicators.',
    'attested-logogram'
  ),
  ulā: akkadianTerm(
    '𒌋𒆷',
    'ulā',
    'not',
    'MAD3 p. 157, ulā < u+lā “not”',
    'MAD3 records normal ù-la and one exceptional u-la spelling; the displayed U.LA sequence is only that exceptional attestation.',
    'attested-exceptional-syllabic-spelling'
  ),
  wabālum: akkadianTerm(
    '𒉿𒁀𒈝',
    'wabālum',
    'to carry hither; to bring',
    'MAD3 p. 13, WBL wabālum “to carry hither, to bring”',
    'The entry cites period forms including u-bíl, u-bí-lam, wa-bíl-si-in, and [w]a-bíl-su.',
    'reconstructed-normalized-syllabic-citation'
  ),
};

const DOMAIN_BY_ROOT = {
  accounts: 'identity',
  assets: 'property',
  blocks: 'sealedRecord',
  contracts: 'sealedCommand',
  dataspaces: 'territory',
  domains: 'territory',
  econometrics: 'reckoning',
  governance: 'decree',
  homePage: 'archive',
  kaigi: 'messenger',
  nfts: 'property',
  scopedExplorer: 'territory',
  settings: 'ordering',
  soracloud: 'messenger',
  sorafs: 'archive',
  studio: 'command',
  table: 'record',
  telemetry: 'reckoning',
  tracing: 'witness',
  transactions: 'deed',
  vpn: 'messenger',
  widgets: 'record',
  zkRegistry: 'seal',
};

const INTENT_PATTERNS = [
  ['failure', /(?:error|fail|invalid|denied|reject|unavailable|missing|unknown|notFound|doesnt|blocked|stale)/iu],
  ['empty', /(?:empty|none|noData|no[A-Z]|never|zero)/u],
  ['seek', /(?:search|filter|lookup|find|query|inspect)/iu],
  ['read', /(?:view|show|open|detail|information|description|hint|note|help|source)/iu],
  ['make', /(?:add|create|build|compile|deploy|submit|mint|register|grant|apply|start|connect)/iu],
  ['remove', /(?:remove|delete|clear|burn|unregister|revoke|dismiss|close|hide|reset)/iu],
  ['renew', /(?:refresh|retry|resume|load|fetch|sync|update|latest|new)/iu],
  ['carry', /(?:copy|export|download|share|send|transfer|relay|import)/iu],
  ['choose', /(?:select|sort|order|option|tab|toggle|pin|compare)/iu],
  ['state', /(?:status|state|result|outcome|ready|connected|committed|approved|accepted|success|active)/iu],
];

const CONCEPT_PATTERNS = [
  ['identity', /account|authority|signer|participant|peer|member|owner|deployer/iu],
  ['property', /asset|nft|rwa|value|amount|quantity|balance|fee|stake|bond/iu],
  ['sealedRecord', /block|height|chain|ledger/iu],
  ['deed', /transaction|instruction|event|activity|operation|call/iu],
  ['seal', /hash|digest|proof|signature|root|commitment|key|fingerprint/iu],
  ['territory', /domain|dataspace|lane|network|node|country|location/iu],
  ['reckoning', /metric|telemetry|count|total|average|latency|time|timestamp|epoch|index|number/iu],
  ['archive', /file|manifest|registry|storage|source|payload|metadata|json|code/iu],
  ['decree', /governance|proposal|council|permission|role|vote|quorum|policy/iu],
  ['messenger', /relay|stream|message|notification|connection|url|endpoint/iu],
  ['command', /contract|entrypoint|trigger|parameter|studio|compile|execute/iu],
  ['witness', /trace|evidence|history|provenance|reference/iu],
  ['ordering', /setting|theme|language|option|filter|sort|page|row|column/iu],
];

const LEXICON = {
  akk: {
    languageStage: 'Sargonic Old Akkadian (Akkad dynasty; period-restricted)',
    domains: {
      archive: AKKADIAN_LEXEMES.ṭuppum,
      command: AKKADIAN_LEXEMES.šiprum,
      decree: AKKADIAN_LEXEMES.awātum,
      deed: AKKADIAN_LEXEMES.kanākum,
      identity: AKKADIAN_LEXEMES.šumum,
      messenger: AKKADIAN_LEXEMES.šiprum,
      ordering: AKKADIAN_LEXEMES.kīnum,
      property: AKKADIAN_LEXEMES.bītum,
      reckoning: AKKADIAN_LEXEMES.ṭuppum,
      record: AKKADIAN_LEXEMES.ṭuppum,
      seal: AKKADIAN_LEXEMES.kanākum,
      sealedCommand: AKKADIAN_LEXEMES.kanākum,
      sealedRecord: AKKADIAN_LEXEMES.kanākum,
      territory: AKKADIAN_LEXEMES.mātum,
      witness: AKKADIAN_LEXEMES.amārum,
    },
    intents: {
      carry: AKKADIAN_LEXEMES.wabālum,
      choose: AKKADIAN_LEXEMES.biʾārum,
      empty: AKKADIAN_LEXEMES.ulā,
      failure: AKKADIAN_LEXEMES.ulā,
      make: AKKADIAN_LEXEMES.apāšum,
      read: AKKADIAN_LEXEMES.amārum,
      remove: AKKADIAN_LEXEMES.nasāḫum,
      renew: AKKADIAN_LEXEMES.apāšum,
      seek: AKKADIAN_LEXEMES.amārum,
      state: AKKADIAN_LEXEMES.kīnum,
    },
    scriptPattern: /[\u{12000}-\u{1254F}]/u,
  },
  egy: {
    languageStage: 'Classical Middle Egyptian (consonantal writing; no supplied vowels)',
    domains: {
      archive: egyptianTerm('𓏞𓏛', 'zẖꜣ.w', 'writing; record; depiction', ['writing']),
      command: egyptianTerm('𓎗𓅱𓏛', 'wḏ.w', 'command; decree', ['command']),
      decree: egyptianTerm('𓎗𓅱𓏛', 'wḏ.w', 'command; decree', ['command']),
      deed: egyptianTerm('𓏞𓏛', 'zẖꜣ.w', 'writing; record; depiction', ['writing']),
      identity: egyptianTerm('𓂋𓈖', 'rn', 'name', ['name']),
      messenger: egyptianTerm('𓄋𓅱𓏏𓏭𓂻𓀀', 'wpw.tj', 'messenger', ['messenger']),
      ordering: egyptianTerm('𓌳𓐙𓂝𓏏𓏛', 'mꜣꜥ.t', 'right order; truth', ['truth']),
      property: egyptianTerm('𓉐𓌉', 'pr-ḥḏ', 'treasury', ['treasury']),
      reckoning: egyptianTerm('𓎛𓋴𓃀𓏴𓏛', 'ḥsb', 'count; reckon; distribute', ['reckon']),
      record: egyptianTerm('𓏞𓏛', 'zẖꜣ.w', 'writing; record; depiction', ['writing']),
      seal: egyptianTerm('𓐍𓏏𓅓𓋩', 'ḫtm', 'seal; sealing; sealing cylinder', ['seal']),
      sealedCommand: egyptianTerm('𓐍𓏏𓅓𓋩', 'ḫtm', 'seal; sealing; sealing cylinder', ['seal']),
      sealedRecord: egyptianTerm('𓐍𓏏𓅓𓋩', 'ḫtm', 'seal; sealing; sealing cylinder', ['seal']),
      territory: egyptianTerm('𓇾', 'tꜣ', 'earth; land; ground', ['land']),
      witness: egyptianTerm('𓌳𓁹𓄿𓄿', 'mꜣꜣ', 'to see; to look', ['see']),
    },
    intents: {
      carry: egyptianTerm('𓏎𓈖', 'jni̯', 'to bring; to fetch', ['bring']),
      choose: egyptianTerm('𓋴𓏏𓊪𓍉𓏛', 'stp', 'to pick out; to choose', ['choose']),
      empty: egyptianTerm('𓂜𓈖', 'nn', 'there is not', ['negative']),
      failure: egyptianTerm('𓂜𓈖', 'nn', 'there is not', ['negative']),
      make: egyptianTerm('𓁹', 'jri̯', 'to do; to make; to create', ['do']),
      read: egyptianTerm('𓂋𓐍𓏛', 'rḫ', 'to know; to learn', ['know']),
      remove: egyptianTerm('𓂧𓂋𓂡', 'dr', 'to drive away; to repel; to remove', ['remove']),
      renew: egyptianTerm('𓄙𓅓', 'wḥm', 'to repeat', ['repeat']),
      seek: egyptianTerm('𓌳𓁹𓄿𓄿', 'mꜣꜣ', 'to see; to look', ['see']),
      state: egyptianTerm('𓌳𓐙𓂝𓏛', 'mꜣꜥ', 'just; correct; true', ['trueAdjective']),
    },
    scriptPattern: EGYPTIAN_BASE_SIGN_PATTERN,
  },
};

function flattenMessages(value, base = '', output = {}) {
  for (const [key, nested] of Object.entries(value)) {
    const path = base ? `${base}.${key}` : key;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      flattenMessages(nested, path, output);
    } else {
      output[path] = nested;
    }
  }
  return output;
}

function unflattenMessages(flat) {
  const output = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let target = output;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= {};
      target = target[part];
    }
    target[parts.at(-1)] = value;
  }
  return output;
}

function inferIntent(path, english) {
  const haystack = `${path} ${english}`;
  return INTENT_PATTERNS.find(([, pattern]) => pattern.test(haystack))?.[0] ?? 'read';
}

function inferConcepts(path) {
  const root = path.split('.')[0];
  const concepts = [DOMAIN_BY_ROOT[root] ?? 'record'];
  for (const [concept, pattern] of CONCEPT_PATTERNS) {
    if (pattern.test(path) && !concepts.includes(concept)) concepts.push(concept);
    if (concepts.length === 3) break;
  }
  return concepts;
}

function protectedFragments(english) {
  return (english.match(PROTECTED_TOKEN_PATTERN) ?? [])
    .map((value) => (value.startsWith('http') ? value.replace(/[.,;)]+$/u, '') : value))
    .filter(Boolean);
}

function egyptianEncodingAssessment(ancientScript) {
  const formatControlsPresent = EGYPTIAN_FORMAT_CONTROL_PATTERN.test(ancientScript);
  return {
    formatControlsPresent,
    quadratClaim: formatControlsPresent ? 'pending-render-review' : 'none',
    classifierPolicy: 'classifiers-constrain-lexical-reading-only',
  };
}

function materializeCandidate(term, index) {
  const [script, transliteration, meaning, metadata] = term;
  return {
    index,
    script,
    transliteration,
    meaning,
    constructionStatus: metadata.constructionStatus,
    ...(metadata.scriptRendering ? { scriptRendering: metadata.scriptRendering } : {}),
    ...(metadata.classifierSemanticContribution
      ? { classifierSemanticContribution: metadata.classifierSemanticContribution }
      : {}),
    lexicalEvidence: metadata.lexicalEvidence.map((evidence) => ({ ...evidence })),
  };
}

function candidateFingerprint(candidate) {
  return JSON.stringify({
    script: candidate?.script,
    transliteration: candidate?.transliteration,
    meaning: candidate?.meaning,
    constructionStatus: candidate?.constructionStatus,
    scriptRendering: candidate?.scriptRendering,
    classifierSemanticContribution: candidate?.classifierSemanticContribution,
    lexicalEvidence: Array.isArray(candidate?.lexicalEvidence)
      ? candidate.lexicalEvidence.map((evidence) => ({
          sourceId: evidence?.sourceId,
          lemmaId: evidence?.lemmaId,
          lemma: evidence?.lemma,
          url: evidence?.url,
          locator: evidence?.locator,
          support: evidence?.support,
        }))
      : candidate?.lexicalEvidence,
  });
}

function candidateBelongsToFiniteInventory(locale, candidate) {
  const lexicon = LEXICON[locale];
  return [...Object.values(lexicon.intents), ...Object.values(lexicon.domains)].some(
    (term) => candidateFingerprint(materializeCandidate(term, 0)) === candidateFingerprint(candidate)
  );
}

function lexicalCitation(locale, evidence, constituentIndex) {
  return locale === 'akk'
    ? {
        sourceId: evidence.sourceId,
        evidenceRole: 'lexical-constituent',
        constituentIndex,
        locator: evidence.locator,
        support: evidence.support,
      }
    : {
        sourceId: 'TLA-LEMMA',
        evidenceRole: 'lexical-constituent',
        constituentIndex,
        locator: `${evidence.lemma} (TLA Lemma ID ${evidence.lemmaId}): ${evidence.url}`,
        support: evidence.support,
      };
}

function constituentEvidence(locale, terms) {
  if (locale === 'akk') {
    return [
      ...terms.flatMap((term, index) =>
        term[3].lexicalEvidence.map((evidence) => ({
          ...lexicalCitation(locale, evidence, index),
          verification: { status: 'pending', reviewer: null, notes: null },
        }))
      ),
      {
        sourceId: 'MAD2',
        evidenceRole: 'grammar-construction',
        locator:
          'MAD2 p. 169, §c “Infinitive”; pp. 145–146, §2 “Construct State”; pp. 218–235, “Sign List”',
        support:
          'MAD2 gives the Old Akkadian Stem I infinitive pattern maPārum. The middle dot is modern UI punctuation separating reconstructed citation forms: it asserts no ancient construct, genitive, relative, or clause syntax. The remaining cited sections supply the contrasting period morphology and sign inventory.',
        verification: { status: 'pending', reviewer: null, notes: null },
      },
    ];
  }
  return [
    ...terms.flatMap((term, index) =>
      term[3].lexicalEvidence.map((evidence) => ({
        ...lexicalCitation(locale, evidence, index),
        verification: { status: 'pending', reviewer: null, notes: null },
      }))
    ),
    {
      sourceId: 'UNICODE17-11',
      evidenceRole: 'unicode-encoding',
      locator: '§11.4 lines 140–146; §11.4.3 lines 176–181',
      support:
        'Encoded signs are basic text elements; classifiers constrain lexical readings rather than contributing independent picture-word translations; quadrat layout requires format controls.',
      verification: { status: 'pending', reviewer: null, notes: null },
    },
  ];
}

function buildRecord(locale, path, english) {
  const lexicon = LEXICON[locale];
  const intentKey = inferIntent(path, english);
  const conceptKeys = inferConcepts(path);
  const intent = lexicon.intents[intentKey];
  const concepts = conceptKeys.map((concept) => lexicon.domains[concept]);
  const constituents = [intent, ...concepts].filter(
    (term, index, terms) => terms.findIndex((candidate) => candidate[1] === term[1]) === index
  );
  const protectedValues = protectedFragments(english);
  const isProtectedLiteral = PROTECTED_FULL_KEYS.has(path);
  const ancientParts = constituents.map((constituent) => constituent[0]);
  const ancientScript = isProtectedLiteral
    ? english
    : `${ancientParts.join(' · ')}${protectedValues.length ? ` · ${protectedValues.join(' · ')}` : ''}`;
  const tier = isProtectedLiteral ? 'transparent extension' : 'poetic reconstruction';

  return {
    uiContext: path,
    intendedProductConcept: english,
    ancientScript,
    scholarlyTransliteration: isProtectedLiteral
      ? '[protected technical literal]'
      : constituents.map((constituent) => constituent[1]).join(' : '),
    literalBackTranslation: isProtectedLiteral
      ? english
      : constituents.map((constituent) => constituent[2]).join('; '),
    modernSemanticInterpretation: english,
    constructionMode: isProtectedLiteral ? 'protected-literal' : 'modern-paratactic-interface-sequence',
    candidateConstituents: isProtectedLiteral
      ? []
      : constituents.map((constituent, index) => materializeCandidate(constituent, index)),
    citedEvidence: isProtectedLiteral ? [] : constituentEvidence(locale, constituents),
    attestationTier: tier,
    constructionRationale: isProtectedLiteral
      ? 'The value is a protected brand, identifier, route, placeholder, or raw protocol literal and is preserved byte-for-byte.'
      : locale === 'egy'
        ? `A modern paratactic UI reconstruction places the ${intentKey} lexeme beside recordkeeping imagery for ${conceptKeys.join(', ')}. Repeated lexemes are collapsed. Every constituent has an exact TLA lemma locator, but the middle dot is modern interface punctuation and the sequence makes no Classical Egyptian phrase, clause, inflection, or word-order claim. Classifiers constrain lexical readings and contribute no independent picture-word meaning. The result remains ${tier} pending script, lexical, corpus-period, forward-semantic, and blind back-translation review.`
        : `A modern paratactic UI reconstruction places the ${intentKey} lexeme beside recordkeeping imagery for ${conceptKeys.join(', ')}. Repeated lexemes are collapsed. The middle dot is a modern interface separator, not Old Akkadian syntax, and the complete digital expression is not claimed as an ancient attestation. Each normalized citation form remains pending script, lexical, forward-semantic, and blind back-translation review.`,
    ...(locale === 'egy' ? { encodingAssessment: egyptianEncodingAssessment(ancientScript) } : {}),
    review: {
      semanticForwardPass: {
        status: 'pending',
        reviewer: null,
        notes: null,
      },
      blindBackTranslationPass: {
        status: 'pending',
        reviewer: null,
        backTranslation: null,
        notes: null,
      },
      protectedLiteralPass: {
        status: protectedValues.length || isProtectedLiteral ? 'pending' : 'not-applicable',
        reviewer: null,
        notes: null,
      },
    },
  };
}

function buildManifest(locale, englishFlat) {
  const records = {};
  for (const [path, value] of Object.entries(englishFlat)) {
    if (typeof value !== 'string') {
      throw new TypeError(`English message ${path} must be a string`);
    }
    records[path] = buildRecord(locale, path, value);
  }
  return {
    schemaVersion: 2,
    locale,
    languageStage: LEXICON[locale].languageStage,
    direction: 'ltr',
    sourceStatus: 'unreviewed-draft',
    runtimePolicy: 'Ancient script only, except reviewed protected literals and interpolation placeholders.',
    reviewPolicy:
      'Seeding never grants approval. Every citation must be verified against a precise source locator. A named forward-semantic reviewer and a different named reviewer working from a blinded ancient-script bundle must approve every record before runtime generation.',
    evidenceRegistry: EVIDENCE[locale],
    records,
  };
}

export function createAncientManifest(locale, english) {
  if (!Object.hasOwn(LEXICON, locale)) throw new Error(`unsupported ancient locale: ${locale}`);
  return buildManifest(locale, flattenMessages(english));
}

function createQualificationReport(locale, expectedRecordCount, actualRecordCount) {
  return {
    locale,
    qualified: false,
    expectedRecordCount,
    actualRecordCount,
    blockerPaths: new Map(),
  };
}

function addBlocker(report, code, path) {
  const paths = report.blockerPaths.get(code) ?? new Set();
  paths.add(path);
  report.blockerPaths.set(code, paths);
}

function finishQualificationReport(report) {
  const entries = [...report.blockerPaths.entries()].sort(([left], [right]) => left.localeCompare(right));
  const blockerCounts = Object.fromEntries(entries.map(([code, paths]) => [code, paths.size]));
  const blockerSamples = Object.fromEntries(entries.map(([code, paths]) => [code, [...paths].sort().slice(0, 10)]));
  return {
    locale: report.locale,
    qualified: entries.length === 0,
    expectedRecordCount: report.expectedRecordCount,
    actualRecordCount: report.actualRecordCount,
    blockerCounts,
    blockerSamples,
  };
}

function extractPlaceholders(value) {
  return (value.match(PLACEHOLDER_PATTERN) ?? []).sort();
}

function extractProtectedTokens(value) {
  return protectedFragments(value).sort();
}

function stripProtectedTokens(value, tokens) {
  let remainder = value;
  for (const token of [...tokens].sort((left, right) => right.length - left.length)) {
    remainder = remainder.replace(token, '');
  }
  return remainder;
}

function hasOnlyAncientScriptAndCommonCharacters(locale, value, protectedTokens) {
  const scriptPattern = new RegExp(LEXICON[locale].scriptPattern.source, 'gu');
  return (
    stripProtectedTokens(value, protectedTokens)
      .replace(scriptPattern, '')
      .replace(COMMON_RUNTIME_CHARACTER_PATTERN, '').length === 0
  );
}

function normalizeReviewerIdentity(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isNamedHumanReviewer(value) {
  if (typeof value !== 'string') return false;
  const reviewer = value.trim();
  const nameParts = reviewer.match(/\p{L}[\p{L}\p{M}'’\-]*/gu) ?? [];
  return (
    reviewer.length >= 3 &&
    nameParts.length >= 2 &&
    !AUTOMATED_REVIEWER_PATTERN.test(reviewer) &&
    !PLACEHOLDER_REVIEWER_PATTERN.test(reviewer)
  );
}

function isSubstantiveReviewNote(value) {
  if (typeof value !== 'string') return false;
  const note = value.trim();
  return note.length >= 12 && !PLACEHOLDER_REVIEW_NOTE_PATTERN.test(note);
}

// eslint-disable-next-line max-params -- qualification records all pass-specific blockers without hidden mutable state
function assessReviewPass(report, path, passName, value, { allowNotApplicable = false, required = true } = {}) {
  const acceptedStatuses = allowNotApplicable
    ? ['pending', 'project-approved', 'not-applicable']
    : ['pending', 'project-approved'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || !acceptedStatuses.includes(value.status)) {
    addBlocker(report, 'reviewShape', path);
    return;
  }
  if (required && value.status !== 'project-approved') {
    addBlocker(report, `${passName}Pending`, path);
    return;
  }
  if (!required && value.status !== 'not-applicable') {
    addBlocker(report, 'unexpectedProtectedLiteralReview', path);
    return;
  }
  if (value.status === 'project-approved' && !isNamedHumanReviewer(value.reviewer)) {
    addBlocker(report, `${passName}Reviewer`, path);
  }
  if (value.status === 'project-approved' && !isSubstantiveReviewNote(value.notes)) {
    addBlocker(report, `${passName}Notes`, path);
  }
}

function evidenceRegistryIsValid(locale, registry) {
  if (!Array.isArray(registry)) return false;
  const actual = new Map(registry.map((entry) => [entry?.sourceId, entry]));
  return EVIDENCE[locale].every((expected) => {
    const entry = actual.get(expected.sourceId);
    return entry?.title === expected.title && entry?.url === expected.url;
  });
}

function evidenceRoleMatchesSource(locale, citation) {
  const allowedSources = EVIDENCE_ROLE_SOURCES[locale][citation.evidenceRole];
  return Array.isArray(allowedSources) && allowedSources.includes(citation.sourceId);
}

// eslint-disable-next-line complexity, max-params -- evidence qualification accumulates every independent defect in one pass
function assessEvidence(report, locale, path, record, isProtectedLiteral) {
  const citations = record.citedEvidence;
  if (locale === 'egy') {
    const expectedEncodingAssessment = egyptianEncodingAssessment(record.ancientScript);
    const actualEncodingAssessment = record.encodingAssessment;
    if (
      actualEncodingAssessment?.formatControlsPresent !== expectedEncodingAssessment.formatControlsPresent ||
      actualEncodingAssessment?.classifierPolicy !== expectedEncodingAssessment.classifierPolicy ||
      actualEncodingAssessment?.quadratClaim !== expectedEncodingAssessment.quadratClaim
    ) {
      addBlocker(report, 'encodingAssessment', path);
    }
    if (expectedEncodingAssessment.formatControlsPresent) {
      addBlocker(report, 'egyptianFormatControlsUnsupported', path);
    }
    if (!expectedEncodingAssessment.formatControlsPresent && actualEncodingAssessment?.quadratClaim !== 'none') {
      addBlocker(report, 'quadratClaimWithoutFormatControls', path);
    }
  }

  if (isProtectedLiteral) {
    if (!Array.isArray(record.candidateConstituents) || record.candidateConstituents.length !== 0) {
      addBlocker(report, 'protectedLiteralConstituents', path);
    }
    if (!Array.isArray(citations) || citations.length !== 0) {
      addBlocker(report, 'protectedLiteralEvidence', path);
    }
    return;
  }

  if (!Array.isArray(citations) || citations.length < 2) {
    addBlocker(report, 'evidenceShape', path);
    return;
  }
  const registeredSources = new Set(EVIDENCE[locale].map(({ sourceId }) => sourceId));
  let evidenceShapeInvalid = false;
  let evidenceLocatorInvalid = false;
  let evidenceVerificationPending = false;
  for (const citation of citations) {
    if (
      !citation ||
      typeof citation !== 'object' ||
      !registeredSources.has(citation.sourceId) ||
      typeof citation.evidenceRole !== 'string' ||
      !evidenceRoleMatchesSource(locale, citation) ||
      typeof citation.locator !== 'string' ||
      typeof citation.support !== 'string' ||
      !citation.support.trim()
    ) {
      evidenceShapeInvalid = true;
      continue;
    }
    if (!citation.locator.trim() || PROVISIONAL_EVIDENCE_PATTERN.test(citation.locator)) {
      evidenceLocatorInvalid = true;
    }
    if (
      citation.verification?.status !== 'project-verified' ||
      !isNamedHumanReviewer(citation.verification?.reviewer) ||
      !isSubstantiveReviewNote(citation.verification?.notes)
    ) {
      evidenceVerificationPending = true;
    }
  }
  if (evidenceShapeInvalid) addBlocker(report, 'evidenceShape', path);
  if (evidenceLocatorInvalid) addBlocker(report, 'evidenceLocator', path);
  if (evidenceVerificationPending) addBlocker(report, 'evidenceVerificationPending', path);
  if (
    record.attestationTier === 'attested' &&
    !citations.some(
      (citation) => citation?.evidenceRole === 'corpus-attestation' && citation.sourceId === ATTESTATION_SOURCES[locale]
    )
  ) {
    addBlocker(report, 'attestationEvidenceCoverage', path);
  }

  const constituents = record.candidateConstituents;
  if (!Array.isArray(constituents) || constituents.length < 1) {
    addBlocker(report, 'constituentShape', path);
    return;
  }
  const validConstituentIndices = new Set();
  for (const [index, constituent] of constituents.entries()) {
    if (
      constituent?.index !== index ||
      typeof constituent.script !== 'string' ||
      !LEXICON[locale].scriptPattern.test(constituent.script) ||
      typeof constituent.transliteration !== 'string' ||
      !constituent.transliteration.trim() ||
      typeof constituent.meaning !== 'string' ||
      !constituent.meaning.trim()
    ) {
      addBlocker(report, 'constituentShape', path);
    }
    if (locale === 'akk') {
      if (
        constituent?.constructionStatus !== 'attested-lexeme' ||
        ![
          'attested-exceptional-syllabic-spelling',
          'attested-logogram',
          'reconstructed-normalized-syllabic-citation',
        ].includes(constituent?.scriptRendering) ||
        !Array.isArray(constituent?.lexicalEvidence) ||
        constituent.lexicalEvidence.length === 0 ||
        !constituent.lexicalEvidence.every(
          (evidence) =>
            evidence?.sourceId === 'MAD3' &&
            typeof evidence.locator === 'string' &&
            evidence.locator.startsWith('MAD3 p') &&
            typeof evidence.support === 'string' &&
            evidence.support.trim()
        )
      ) {
        addBlocker(report, 'akkadianConstituentMetadata', path);
      }
    }
    if (locale === 'egy') {
      if (
        constituent?.constructionStatus !== 'attested-lexeme' ||
        EGYPTIAN_FORMAT_CONTROL_PATTERN.test(constituent?.script ?? '') ||
        !Array.isArray(constituent?.lexicalEvidence) ||
        constituent.lexicalEvidence.length === 0 ||
        !constituent.lexicalEvidence.every(
          (evidence) =>
            typeof evidence?.lemmaId === 'string' &&
            typeof evidence?.lemma === 'string' &&
            evidence.url === `https://thesaurus-linguae-aegyptiae.de/lemma/${evidence.lemmaId}` &&
            typeof evidence?.support === 'string' &&
            evidence.support.trim()
        )
      ) {
        addBlocker(report, 'egyptianConstituentMetadata', path);
      }
      if (constituent?.classifierSemanticContribution !== 'none') {
        addBlocker(report, 'classifierPictureWordSemantics', path);
      }
    }
    if (!candidateBelongsToFiniteInventory(locale, constituent)) {
      addBlocker(report, 'constituentInventory', path);
    }
    if (
      citations.some(
        (citation) => citation?.evidenceRole === 'lexical-constituent' && citation.constituentIndex === index
      )
    ) {
      validConstituentIndices.add(index);
    }
  }
  if (validConstituentIndices.size !== constituents.length) {
    addBlocker(report, 'constituentEvidenceCoverage', path);
  }
  const expectedLexicalCitations = constituents.flatMap((constituent, index) =>
    Array.isArray(constituent.lexicalEvidence)
      ? constituent.lexicalEvidence.map((evidence) => lexicalCitation(locale, evidence, index))
      : []
  );
  const actualLexicalCitations = citations
    .filter((citation) => citation?.evidenceRole === 'lexical-constituent')
    .map(({ sourceId, evidenceRole, constituentIndex, locator, support }) => ({
      sourceId,
      evidenceRole,
      constituentIndex,
      locator,
      support,
    }));
  if (JSON.stringify(actualLexicalCitations) !== JSON.stringify(expectedLexicalCitations)) {
    addBlocker(report, 'lexicalEvidenceCoherence', path);
  }
  const expectedProtectedValues = protectedFragments(record.intendedProductConcept);
  const expectedAncientScript = `${constituents.map(({ script }) => script).join(' · ')}${
    expectedProtectedValues.length ? ` · ${expectedProtectedValues.join(' · ')}` : ''
  }`;
  const expectedTransliteration = constituents.map(({ transliteration }) => transliteration).join(' : ');
  const expectedBackTranslation = constituents.map(({ meaning }) => meaning).join('; ');
  if (
    new Set(constituents.map(({ transliteration }) => transliteration)).size !== constituents.length ||
    record.ancientScript !== expectedAncientScript ||
    record.scholarlyTransliteration !== expectedTransliteration ||
    record.literalBackTranslation !== expectedBackTranslation
  ) {
    addBlocker(report, 'constituentComposition', path);
  }
  if (
    record.constructionMode !== 'modern-paratactic-interface-sequence' &&
    !citations.some((citation) => citation?.evidenceRole === 'grammar-construction')
  ) {
    addBlocker(report, 'constructionEvidenceCoverage', path);
  }
  if (locale === 'egy' && !citations.some((citation) => citation?.evidenceRole === 'unicode-encoding')) {
    addBlocker(report, 'unicodeEvidenceCoverage', path);
  }
}

// eslint-disable-next-line complexity -- a complete report is required; failing on the first malformed record would hide review work
export function assessAncientManifest(locale, manifest, english) {
  if (!Object.hasOwn(LEXICON, locale)) throw new Error(`unsupported ancient locale: ${locale}`);
  const englishFlat = flattenMessages(english);
  const expectedPaths = Object.keys(englishFlat).sort();
  const records = manifest?.records && typeof manifest.records === 'object' ? manifest.records : {};
  const actualPaths = Object.keys(records).sort();
  const report = createQualificationReport(locale, expectedPaths.length, actualPaths.length);

  if (
    manifest?.schemaVersion !== 2 ||
    manifest?.locale !== locale ||
    manifest?.direction !== 'ltr' ||
    manifest?.languageStage !== LEXICON[locale].languageStage
  ) {
    addBlocker(report, 'manifestMetadata', '$');
  }
  if (manifest?.sourceStatus !== 'project-reviewed') {
    addBlocker(report, 'manifestReviewPending', '$');
  }
  if (!evidenceRegistryIsValid(locale, manifest?.evidenceRegistry)) {
    addBlocker(report, 'evidenceRegistry', '$');
  }

  const expectedSet = new Set(expectedPaths);
  const actualSet = new Set(actualPaths);
  for (const path of expectedPaths) {
    if (!actualSet.has(path)) addBlocker(report, 'missingRecord', path);
  }
  for (const path of actualPaths) {
    if (!expectedSet.has(path)) addBlocker(report, 'extraRecord', path);
  }

  for (const path of expectedPaths) {
    const record = records[path];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      if (actualSet.has(path)) addBlocker(report, 'recordShape', path);
      continue;
    }
    const requiredStrings = [
      'uiContext',
      'intendedProductConcept',
      'ancientScript',
      'scholarlyTransliteration',
      'literalBackTranslation',
      'modernSemanticInterpretation',
      'constructionMode',
      'attestationTier',
      'constructionRationale',
    ];
    if (requiredStrings.some((field) => typeof record[field] !== 'string' || !record[field].trim())) {
      addBlocker(report, 'recordShape', path);
      continue;
    }
    const englishValue = englishFlat[path];
    if (
      record.uiContext !== path ||
      record.intendedProductConcept !== englishValue ||
      record.modernSemanticInterpretation !== englishValue
    ) {
      addBlocker(report, 'semanticContext', path);
    }
    if (!['attested', 'transparent extension', 'poetic reconstruction'].includes(record.attestationTier)) {
      addBlocker(report, 'attestationTier', path);
    }
    const isProtectedLiteral = PROTECTED_FULL_KEYS.has(path);
    const expectedConstructionMode = isProtectedLiteral
      ? 'protected-literal'
      : 'modern-paratactic-interface-sequence';
    if (record.constructionMode !== expectedConstructionMode) {
      addBlocker(report, 'constructionMode', path);
    }
    const expectedAttestationTier = isProtectedLiteral ? 'transparent extension' : 'poetic reconstruction';
    if (record.attestationTier !== expectedAttestationTier) {
      addBlocker(report, 'attestationTierForConstruction', path);
    }

    const expectedPlaceholders = extractPlaceholders(englishValue);
    const actualPlaceholders = extractPlaceholders(record.ancientScript);
    if (JSON.stringify(actualPlaceholders) !== JSON.stringify(expectedPlaceholders)) {
      addBlocker(report, 'placeholderParity', path);
    }
    const expectedProtectedTokens = extractProtectedTokens(englishValue);
    const actualProtectedTokens = extractProtectedTokens(record.ancientScript);
    if (JSON.stringify(actualProtectedTokens) !== JSON.stringify(expectedProtectedTokens)) {
      addBlocker(report, 'protectedTokenParity', path);
    }
    if (isProtectedLiteral) {
      if (record.ancientScript !== englishValue) addBlocker(report, 'protectedLiteralExactness', path);
    } else {
      if (!LEXICON[locale].scriptPattern.test(record.ancientScript)) {
        addBlocker(report, 'ancientScriptMissing', path);
      }
      if (!hasOnlyAncientScriptAndCommonCharacters(locale, record.ancientScript, expectedProtectedTokens)) {
        addBlocker(report, 'unexpectedRuntimeScript', path);
      }
    }

    assessEvidence(report, locale, path, record, isProtectedLiteral);

    const requiresProtectedLiteralReview = isProtectedLiteral || expectedProtectedTokens.length > 0;
    assessReviewPass(report, path, 'semanticForward', record.review?.semanticForwardPass);
    assessReviewPass(report, path, 'blindBackTranslation', record.review?.blindBackTranslationPass);
    assessReviewPass(report, path, 'protectedLiteral', record.review?.protectedLiteralPass, {
      allowNotApplicable: true,
      required: requiresProtectedLiteralReview,
    });
    const forwardReviewer = record.review?.semanticForwardPass?.reviewer;
    const backTranslationReviewer = record.review?.blindBackTranslationPass?.reviewer;
    if (
      record.review?.semanticForwardPass?.status === 'project-approved' &&
      record.review?.blindBackTranslationPass?.status === 'project-approved' &&
      typeof forwardReviewer === 'string' &&
      typeof backTranslationReviewer === 'string' &&
      normalizeReviewerIdentity(forwardReviewer) === normalizeReviewerIdentity(backTranslationReviewer)
    ) {
      addBlocker(report, 'reviewerIndependence', path);
    }
    if (
      record.review?.blindBackTranslationPass?.status === 'project-approved' &&
      (typeof record.review.blindBackTranslationPass.backTranslation !== 'string' ||
        !record.review.blindBackTranslationPass.backTranslation.trim())
    ) {
      addBlocker(report, 'blindBackTranslationMissing', path);
    }
  }

  return finishQualificationReport(report);
}

export class AncientLocaleQualificationError extends Error {
  constructor(reports) {
    const summary = reports
      .filter(({ qualified }) => !qualified)
      .map(({ locale, blockerCounts }) => {
        const blockers = Object.entries(blockerCounts)
          .map(([code, count]) => `${code}=${count}`)
          .join(', ');
        return `${locale}: ${blockers}`;
      })
      .join('; ');
    super(`Ancient locale qualification failed: ${summary}`);
    this.name = 'AncientLocaleQualificationError';
    this.reports = reports;
  }
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeOrCheck(path, content, check) {
  if (!check) {
    await writeFile(path, content, 'utf8');
    return;
  }
  const existing = await readFile(path, 'utf8');
  if (existing !== content) throw new Error(`${path} is not deterministically generated`);
}

export function createAncientRuntimeCatalog(locale, manifest, english) {
  const report = assessAncientManifest(locale, manifest, english);
  if (!report.qualified) throw new AncientLocaleQualificationError([report]);
  return unflattenMessages(
    Object.fromEntries(Object.entries(manifest.records).map(([path, record]) => [path, record.ancientScript]))
  );
}

export async function auditAncientLocales() {
  const english = await readJson(ENGLISH_PATH);
  const reports = [];
  for (const locale of ['akk', 'egy']) {
    const manifest = await readJson(SOURCE_PATHS[locale]);
    reports.push(assessAncientManifest(locale, manifest, english));
  }
  return reports;
}

export async function generateAncientLocales({ seedManifests = false, resetReviews = false, check = false } = {}) {
  if (seedManifests && check) throw new Error('--seed-manifests and --check are mutually exclusive');
  if (seedManifests && !resetReviews) {
    throw new Error('--seed-manifests requires --reset-reviews because seeding discards every scholarly approval');
  }
  const english = await readJson(ENGLISH_PATH);
  const englishFlat = flattenMessages(english);

  const manifests = {};
  for (const locale of ['akk', 'egy']) {
    manifests[locale] = seedManifests ? buildManifest(locale, englishFlat) : await readJson(SOURCE_PATHS[locale]);
  }
  const reports = Object.entries(manifests).map(([locale, manifest]) =>
    assessAncientManifest(locale, manifest, english)
  );

  if (seedManifests) {
    const expectedSeedBlockers = new Set([
      'blindBackTranslationPending',
      'evidenceLocator',
      'evidenceVerificationPending',
      'manifestReviewPending',
      'protectedLiteralPending',
      'semanticForwardPending',
    ]);
    for (const report of reports) {
      const unexpectedBlockers = Object.keys(report.blockerCounts).filter((code) => !expectedSeedBlockers.has(code));
      if (unexpectedBlockers.length) throw new AncientLocaleQualificationError(reports);
    }
    for (const locale of ['akk', 'egy']) {
      const manifest = manifests[locale];
      await writeFile(SOURCE_PATHS[locale], serializeJson(manifest), 'utf8');
    }
    return reports;
  }

  if (reports.some(({ qualified }) => !qualified)) {
    throw new AncientLocaleQualificationError(reports);
  }

  for (const locale of ['akk', 'egy']) {
    const runtime = createAncientRuntimeCatalog(locale, manifests[locale], english);
    await writeOrCheck(RUNTIME_PATHS[locale], serializeJson(runtime), check);
  }
  return reports;
}

const args = new Set(process.argv.slice(2));
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const knownArgs = new Set(['--check', '--report', '--reset-reviews', '--seed-manifests']);
  const unknownArgs = [...args].filter((arg) => !knownArgs.has(arg));
  if (unknownArgs.length) throw new Error(`unknown argument(s): ${unknownArgs.join(', ')}`);
  if (args.has('--report')) {
    if (args.size !== 1) throw new Error('--report cannot be combined with mutating or check arguments');
    process.stdout.write(`${JSON.stringify(await auditAncientLocales(), null, 2)}\n`);
  } else {
    await generateAncientLocales({
      seedManifests: args.has('--seed-manifests'),
      resetReviews: args.has('--reset-reviews'),
      check: args.has('--check'),
    });
  }
}
