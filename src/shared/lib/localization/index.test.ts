import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureLocaleLoaded, i18n, SUPPORTED_LOCALES } from './index';
import en from './en.json';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALIZATION_DIR = dirname(fileURLToPath(import.meta.url));
const SHIPPED_LOCALE_FILES = readdirSync(LOCALIZATION_DIR).filter((file) => file.endsWith('.json'));
const SHIPPED_LOCALES = SHIPPED_LOCALE_FILES.map((file) => file.replace(/\.json$/, ''));
const SHIPPED_NON_EN_LOCALE_FILES = SHIPPED_LOCALE_FILES.filter((file) => file !== 'en.json');
const ANCIENT_LOCALES = ['akk', 'egy'] as const;
interface AncientReviewPass {
  status?: unknown;
  reviewer?: unknown;
  notes?: unknown;
  backTranslation?: unknown;
}
interface AncientSourceRecord {
  uiContext?: unknown;
  intendedProductConcept?: unknown;
  ancientScript?: unknown;
  scholarshipTransliteration?: unknown;
  scholarlyTransliteration?: unknown;
  literalBackTranslation?: unknown;
  modernSemanticInterpretation?: unknown;
  constructionMode?: unknown;
  constructionRationale?: unknown;
  attestationTier?: unknown;
  candidateConstituents?: unknown[];
  citedEvidence?: Array<{
    verification?: AncientReviewPass;
  }>;
  review?: {
    semanticForwardPass?: AncientReviewPass;
    blindBackTranslationPass?: AncientReviewPass;
    protectedLiteralPass?: AncientReviewPass;
  };
}
interface AncientSourceManifest {
  schemaVersion?: unknown;
  locale?: unknown;
  direction?: unknown;
  sourceStatus?: unknown;
  records: Record<string, AncientSourceRecord>;
}
const PROTECTED_LITERAL_KEYS = [
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
  'dataspaces.accountLiteralPlaceholder',
  'accounts.filters.domainPlaceholder',
  'assets.filters.ownerPlaceholder',
  'assets.filters.domainPlaceholder',
  'contracts.filters.contractAliasPlaceholder',
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
] as const;
const LOCALE_SCRIPTS: Record<string, readonly string[]> = {
  am: ['Ethiopic', 'Latin'],
  ar: ['Arabic', 'Latin'],
  az: ['Latin'],
  de: ['Latin'],
  dv: ['Thaana', 'Latin'],
  dz: ['Tibetan', 'Latin'],
  es: ['Latin'],
  fr: ['Latin'],
  he: ['Hebrew', 'Latin'],
  hy: ['Armenian', 'Latin'],
  id: ['Latin'],
  jp: ['Han', 'Hiragana', 'Katakana', 'Latin'],
  ka: ['Georgian', 'Latin'],
  kh: ['Khmer', 'Latin'],
  ko: ['Hangul', 'Han', 'Latin'],
  my: ['Myanmar', 'Latin'],
  ne: ['Devanagari', 'Latin'],
  ru: ['Cyrillic', 'Latin'],
  si: ['Sinhala', 'Latin'],
  ta: ['Tamil', 'Latin'],
  th: ['Thai', 'Latin'],
  tr: ['Latin'],
  uk: ['Cyrillic', 'Latin'],
  ur: ['Arabic', 'Latin'],
  'zh-TW': ['Han', 'Bopomofo', 'Latin'],
};
const IDENTICAL_MULTIWORD_ALLOWLIST = new Set([
  'homePage.title.firstLine',
  'studio.nav',
  'dataspaces.publicNodes.url',
  'kaigi.filterDomain',
  'vpn.profile.fields.tlsSpkiDigest',
]);
const FULLY_LOCALIZED_SENTINEL_KEYS = [
  'accountId',
  'transactions.upgrade',
  'transactions.authority',
  'blocks.hash',
  'blocks.height',
  'blocks.bodyUnavailable',
  'tracing.resume',
  'tracing.clear',
  'zkRegistry.filters.order',
  'mintable',
  'telemetry.lane',
  'sorafs.columns.manifest',
  'table.cursorPage',
  'table.cursorRepeated',
  'table.invalidPagination',
  'table.invalidCursorPagination',
  'table.resetPagination',
  'table.fetchWindowLimit',
  'assets.provenanceNoParents',
  'assets.provenanceIncomplete',
  'contracts.explorerHint',
  'contracts.filters.authorityPlaceholder',
  'contracts.validation.canonicalContractAddress',
  'contracts.validation.canonicalContractAlias',
  'contracts.validation.noritoStringValue',
  'zkRegistry.errors.verifyingKeys',
  'sorafs.detail.publicLinksUnavailable',
  'settings.failoverUnavailable',
  'settings.nodeInvalid',
  'telemetry.noNodeTelemetry',
  'tracing.title',
  'tracing.fetchError',
  'transactions.contractView.unavailable',
  'homePage.searchPlaceholder',
  'homePage.search.placeholder',
  'dataspaces.accountLiteralLabel',
  'dataspaces.hint',
  'dataspaces.accountRequired',
  'dataspaces.accountInvalid',
  'soracloud.validation.accountId',
  'vpn.profile.title',
  'vpn.profile.description',
  'vpn.profile.unavailable',
  'vpn.profile.loadError',
  'vpn.profile.fields.availability',
  'vpn.profile.fields.relayEndpoint',
  'vpn.profile.fields.exitClasses',
  'vpn.profile.fields.leaseDuration',
  'vpn.profile.fields.billing',
  'vpn.profile.fields.operatorAccount',
  'vpn.profile.fields.tlsServerName',
  'vpn.profile.fields.directorySnapshot',
  'vpn.profile.fields.defaultExitClass',
  'vpn.profile.fields.dnsPushInterval',
  'vpn.profile.fields.meterFamily',
  'vpn.profile.fields.routePushes',
  'vpn.profile.fields.excludedRoutes',
  'vpn.profile.fields.dnsServers',
  'vpn.profile.fields.tunnelAddresses',
  'vpn.profile.fields.leaseFee',
  'vpn.profile.fields.settlementGrace',
  'vpn.profile.fields.flowLabelBits',
  'vpn.profile.fields.paddingBudget',
  'vpn.profile.fields.relayId',
  'vpn.profile.fields.relayMldsa65PublicKey',
  'vpn.profile.fields.descriptorCommit',
  'vpn.profile.fields.relayCertificateDigest',
] as const;
const ACCESS_BOUNDARY_KEYS = [
  'dataspaces.accessBoundary.diagnosticTitle',
  'dataspaces.accessBoundary.diagnosticDescription',
  'dataspaces.accessBoundary.governanceTitle',
  'dataspaces.accessBoundary.governanceDescription',
  'vpn.accessBoundary.eyebrow',
  'vpn.accessBoundary.title',
  'vpn.accessBoundary.metricsDescription',
  'vpn.accessBoundary.browserDescription',
  'vpn.accessBoundary.contractTitle',
  'vpn.accessBoundary.endpointLabel',
  'vpn.accessBoundary.toriiAdmissionLabel',
  'vpn.accessBoundary.toriiAdmissionValue',
  'vpn.accessBoundary.deploymentPolicyLabel',
  'vpn.accessBoundary.deploymentPolicyValue',
  'vpn.accessBoundary.explorerBehaviorLabel',
  'vpn.accessBoundary.explorerBehaviorValue',
  'governance.accessBoundary.eyebrow',
  'governance.accessBoundary.title',
  'governance.accessBoundary.protectedReads',
  'governance.accessBoundary.capabilities',
  'governance.accessBoundary.singleSignatureTitle',
  'governance.accessBoundary.singleSignatureDescription',
  'governance.accessBoundary.multisigWitnessTitle',
  'governance.accessBoundary.multisigWitnessDescription',
  'governance.accessBoundary.contractTitle',
  'governance.accessBoundary.contractDescription',
  'soracloud.accessBoundary.eyebrow',
  'soracloud.accessBoundary.title',
  'soracloud.accessBoundary.discoveryDescription',
  'soracloud.accessBoundary.protectedDescription',
  'soracloud.accessBoundary.contractTitle',
  'soracloud.accessBoundary.publicDiscoveryTitle',
  'soracloud.accessBoundary.authenticatedReadsTitle',
  'telemetry.operatorBoundary.publicDescription',
] as const;
const RETIRED_ECONOMETRICS_SCAN_PATTERNS: Record<string, RegExp> = {
  am: /(?:\bUI\b|ይቃኛል|መቃኘት|በቅርብ ጊዜ|ናሙና)/iu,
  ar: /(?:واجهة المستخدم|مسح تعليمات|عينة حديثة)/u,
  az: /(?:\bUI\b|skan edir|skan limit|son nümunə)/iu,
  de: /(?:Benutzeroberfläche|scannt|Scan-Limit|aktuelle(?:n)? Stichprobe)/iu,
  dv: /(?:ޔޫއައި|ސްކޭން|ފަހުގެ ސާމްޕަލް)/u,
  dz: /(?:ཡུ་ཨའི|པར་ལོག|འཕྲལ་གྱི་དཔེ་ཚད)/u,
  en: /(?:\bUI\b|\bscan(?:s|ned|ning)?\b|\bfallback\b|\bsampled\b|\bbrowser\b|\brecent sample\b)/iu,
  es: /(?:interfaz de usuario|escane|límite de escaneo|muestra reciente)/iu,
  fr: /(?:interface utilisateur|analyse les instructions|limite d’analyse|échantillon récent)/iu,
  he: /(?:ממשק המשתמש|סורק|מגבלות הסריקה|מדגימה עדכנית)/u,
  hy: /(?:միջերեսը|սկան|վերջին նմուշից)/iu,
  id: /(?:\bUI\b|memindai|batas pemindaian|sampel .* terbaru)/iu,
  jp: /(?:\bUI\b|スキャン|最近のサンプル)/iu,
  ka: /(?:\bUI\b|სკან|ბოლო ნიმუშიდან)/iu,
  kh: /(?:\bUI\b|ស្កេន|គំរូថ្មីៗ)/iu,
  ko: /(?:\bUI\b|스캔|최근 .* 샘플)/iu,
  my: /(?:\bUI\b|စကင်|မကြာသေးမီက .* နမူနာ)/iu,
  ne: /(?:\bUI\b|स्क्यान|भर्खरैको नमूनाबाट)/iu,
  ru: /(?:пользовательский интерфейс|скан|недавнего образца)/iu,
  si: /(?:\bUI\b|ස්කෑන්|පරිලෝකනය|මෑත නියැදියකින්)/iu,
  ta: /(?:\bUI\b|ஸ்கேன்|சமீபத்திய மாதிரியிலிருந்து)/iu,
  th: /(?:\bUI\b|สแกน|ตัวอย่าง.*ล่าสุด)/iu,
  tr: /(?:kullanıcı arayüzü|tarama sınır|talimatlarını tarar|güncel bir örneğinden)/iu,
  uk: /(?:користувальницький інтерфейс|скан|останнього зразка)/iu,
  ur: /(?:\bUI\b|اسکین|حالیہ نمونے)/iu,
  'zh-TW': /(?:\bUI\b|掃描|最近的.*樣本)/iu,
};
const RETIRED_ECONOMETRICS_CHURN_KEYS = [
  'churnTitle',
  'churnEmpty',
  'churnNote',
  'previousSnapshot',
  'snapshotDelta',
  'retained',
  'entered',
  'exited',
  'retentionPrev',
  'retentionCurrent',
] as const;
const INVERTED_STATE_MAP_TRANSLATIONS: Record<string, readonly string[]> = {
  am: ['የማፕ ሁኔታ'],
  ar: ['حالة الخريطة'],
  az: ['Map vəziyyəti'],
  de: ['Map-Zustand'],
  dv: ['State of map'],
  dz: ['ས་ཁྲ་གི་གནས་ཚུལ།'],
  es: ['Estado de mapa'],
  he: ['מצב מפה'],
  hy: ['Արտապատկերի վիճակը'],
  id: ['Status pemetaan'],
  jp: ['マップ状態'],
  ko: ['맵 상태'],
  ne: ['नक्साको अवस्था'],
  ru: ['Состояние отображения'],
  tr: ['Eşlem durumu'],
  uk: ['Стан відображення'],
  ur: ['میپ کی حالت'],
  'zh-TW': ['對映狀態'],
};
const RETIRED_LOW_RESOURCE_FALSE_FRIENDS: Record<string, Readonly<Record<string, readonly string[]>>> = {
  dv: {
    'searchResults.exactHash': ['އެކިއުޒެކްޓް ހޭޝް'],
    'econometrics.netIssuance': ['ސާފު ދޫކުރުން'],
    'soracloud.lastRestartSequence': ['އެންމެ ފަހުން ރީސްޓާޓް ކުރި ސިކުނޑި'],
    'telemetry.recentEvictions': ['ފަހުގެ RBC ގެއިން ބޭރުކުރުން'],
    'telemetry.noRbcEvictions': ['ފަހުގެ ތާރީޚެއްގައި ގެއިން ބޭރުކުރުން'],
    'telemetry.epoch': ['އިއްތިފާޤު ޒަމާން'],
    'telemetry.rawEvents': ['ރޯ ހާދިސާތައް'],
    'studio.instructionPresentation.titles.Grant_PermissionToAccount': ['އެކައުންޓް ހުޅުވުމުގެ ހުއްދަ ދޫކުރުން'],
    'studio.graph.edgeLabels.else': ['އެހެން ނޫން'],
    'studio.graph.templateNodes.threshold_escrow.call_open.title': ['ހުޅުވާފައި ބެހެއްޓުމަށް ބާރުއަޅާ'],
    'studio.graph.templateNodes.threshold_escrow.release_open.title': ['ހުޅުވާފައި ބެހެއްޓުމަށް ބާރުއަޅާ'],
    'studio.graph.templateNodes.threshold_escrow.guard_target_max.failureMessage': [
      'ޑިޕޮސިޓް އިތުރުވެއްޖެ target_amount',
    ],
    'studio.blockly.blocks.query': ['%1 އާއި %2 ގެ ގޮތުގައި ސޭވް ކުރޭ'],
  },
  dz: {
    'telemetry.telemetry': ['གློག་ཐག་ར་བ་'],
    'studio.blockly.options.false': ['ཕྲང་གཏམ་'],
    'studio.graph.badges.void': ['ཆ་མེད་གཏང་ནི་'],
    'studio.blockly.blocks.trigger': ['གློག་ཐག་ར་བ་'],
  },
  kh: {
    'contracts.columns.block': ['លេខលំដាប់ប្លុកខ្សែចង្វាក់ដែលបានដាក់បង្ហាញ'],
    'transactions.log': ['ការណែនាំសារ-កំណត់ហេតុ'],
    'studio.graph.badges.void': ['លុបចោល'],
    'assets.definitionFields.aliasBoundAt': ['ស្លាកលេខ ភ្នំពេញ 2'],
  },
  my: {
    'appMetadata.description': [
      'Hyperledger Iroha ပေါ်တွင် ဘလော့များ၊ ငွေပေးချေမှုများ၊ အကောင့်များ၊ အရင်းအမြစ်များ၊ အုပ်ချုပ်ရေးစနစ်နှင့် ကွန်ရက် တယ်လီမီထရီကို စူးစမ်းပါ။',
    ],
    'widgets.latestBlocks': ['နောက်ဆုံးပိတ်များ'],
    'studio.graph.fields.returnValue': ['အကျိုးအမြတ်တန်ဖိုး'],
    'assets.definitionFields.aliasBoundAt': ['အမည်မဖော်လိုသူ'],
  },
  ne: {
    'contracts.columns.block': ['ब्लकचेन अनुक्रम संख्या जहाँ डिप्लोइमेन्ट भयो'],
    'studio.graph.badges.void': ['अवैध'],
    'studio.instructionPresentation.fields.atomicAmount': ['परमाणु मात्रा'],
    'assets.definitionFields.aliasBoundAt': ['अन्य नामहरू'],
  },
  si: {
    'appMetadata.description': [
      'Hyperledger Iroha හරහා බ්ලොක්, ගනුදෙනු, ගිණුම්, වත්කම්, පාලනය සහ ජාල දුරකථන විද් යාව ගවේෂණය කරන්න.',
    ],
    'studio.graph.portDirections.output': ['නිෂ්පාදනය'],
    'studio.graph.fields.returnValue': ['ආපසු ගෙවීමේ වටිනාකම'],
    'studio.graph.fields.condition': ['තත්ත්වය'],
  },
  ta: {
    'contracts.columns.block': ['வினியோகிக்கப்பட்டதால் உருவான ப்லாக்செயின் வரிசை எண்'],
    'transactions.log': ['லக்-செய்தி கட்டளை'],
    'studio.graph.badges.void': ['தள்ளுபடி'],
    'studio.blockly.blocks.trigger': ['துப்பாக்கி'],
    'assets.definitionFields.aliasBoundAt': ['அலைபேசிகள்'],
  },
  th: {
    'appMetadata.keywords': ['Hyperledger Iroha, blockchain, หนังสือพิมพ์จําหน่าย, บล็อก, การเทรนซัค'],
    'soracloud.no': ['เลขที่'],
    'studio.graph.badges.void': ['เป้าหมาย'],
    'contracts.filters.derived': ['สาขากลาง'],
    'assets.definitionFields.aliasStatus': ['สถานะชื่อเบียร์'],
  },
};
describe('localization catalogs', () => {
  beforeAll(async () => {
    for (const locale of SUPPORTED_LOCALES) {
      await ensureLocaleLoaded(locale);
    }
  });

  const collectLeafPaths = (value: unknown, base = ''): string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

    const entries = Object.entries(value as Record<string, unknown>);
    return entries.flatMap(([key, nested]) => {
      const current = base ? `${base}.${key}` : key;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return collectLeafPaths(nested, current);
      }
      return [current];
    });
  };

  const getAtPath = (value: unknown, fullPath: string): unknown => {
    return fullPath.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
  };

  const extractPlaceholders = (value: string): string[] => {
    return (value.match(/\{[^{}]+\}|%\d+/g) ?? []).sort();
  };

  const countSentenceEndings = (value: string): number => {
    const asciiEndings = value.match(/[.!?](?=\s|$)/gu)?.length ?? 0;
    const scriptEndings = value.match(/[։。！？።།༎।॥۔။។]/gu)?.length ?? 0;
    return asciiEndings + scriptEndings;
  };

  const countTranslatedClauseEndings = (value: string): number => {
    const semicolonClauses = value.match(/[;؛](?=\s|$)/gu)?.length ?? 0;
    return countSentenceEndings(value) + semicolonClauses;
  };

  const extractProtectedTokens = (value: string): string[] => {
    const patterns = [
      /`[^`]+`/gu,
      /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu,
      /\/v\d+\/[A-Za-z0-9_{}./:-]+/gu,
      /(?:TLS SPKI SHA-256|ML-DSA-65|SHA-256|ActivateContractInstance|AMX|ABI|API|ASCII|Base58|BLS|CAR|CIDR|CID|DA|DeFi|DNS|DvP|ExecuteTrigger|FX|HHI|HPKE|HSM|HTTP|I105|i105|Hyperledger|Iroha Connect|IrohaConnect|IrohaSwap|Iroha|JavaScript|JSON|KAIGI|Kotodama|MTU|NetworkId|Nexus|NFTs?|Norito|NPoS|OperatorSigningContext|P95|PoolAccount|PoolAssetA|PoolAssetB|PRF|Prometheus|PvP|QC|RBC|RemoveKeyValue|ReserveA|ReserveB|RTT|Rust|RWA|SDK|SetKeyValue|SetParameter|SoraCloud|Soracloud|Soracles|SoraFS|SSE|TLS|Torii|TTL|TxID|UAID|VPN|VRF|WASM|WebAuthn|XYK|ZK1|ZK|base64url)/gu,
    ];

    return patterns
      .flatMap((pattern) => value.match(pattern) ?? [])
      .map((token) => {
        if (token === 'NFTs') return 'NFT';
        if (token.toLowerCase() === 'i105') return 'i105';
        return token;
      })
      .sort();
  };

  afterEach(() => {
    i18n.global.locale.value = 'en';
  });

  it('uses the canonical Hyperledger Iroha brand spelling', () => {
    expect(en.homePage.title.firstLine).toBe('Hyperledger Iroha');

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');

      expect(raw, `locale=${locale}`).not.toMatch(/Hyperleger Iroha/i);
    }
  });

  it('keeps every shipped JSON locale structurally complete and non-empty', () => {
    const expectedPaths = collectLeafPaths(en).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const actualPaths = collectLeafPaths(parsed).sort();

      expect(actualPaths, `locale=${locale}`).toEqual(expectedPaths);

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe(typeof expected);
        if (typeof actual === 'string') {
          expect(actual.trim(), `locale=${locale} key=${key}`).not.toBe('');
        }
      }
    }
  });

  it('fully localizes the exact Torii system-parameters surface', () => {
    expect(en.parameters.description).toBe(
      "Current executor and system limits returned by Torii's exact /v1/parameters snapshot."
    );

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const description = getAtPath(parsed, 'parameters.description');

      expect(description, `locale=${locale}`).toMatch(/Torii/u);
      expect(description, `locale=${locale}`).toMatch(/\/v1\/parameters/u);

      if (locale === 'en') continue;
      for (const key of ['parameters.nav', 'parameters.title', 'parameters.description', 'parameters.loadError']) {
        expect(getAtPath(parsed, key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
    }
  });

  it('keeps Soracles and DeFi canonical while localizing every human-facing Soracles label', () => {
    const localizedKeys = [
      'soracles.description',
      'soracles.feeds',
      'soracles.history',
      'soracles.attestation',
      'soracles.loadError',
      'soracles.historyError',
      'soracles.attestationError',
      'soracles.selectFeed',
    ] as const;

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      expect(getAtPath(parsed, 'soracles.nav'), `locale=${locale}`).toBe('Soracles');
      expect(getAtPath(parsed, 'soracles.title'), `locale=${locale}`).toBe('Soracles');
      expect(getAtPath(parsed, 'soracles.description'), `locale=${locale}`).toMatch(/DeFi/u);
      expect(getAtPath(parsed, 'soracles.attestation'), `locale=${locale}`).toMatch(/DeFi/u);
      expect(getAtPath(parsed, 'soracles.attestationError'), `locale=${locale}`).toMatch(/DeFi/u);
      expect(getAtPath(parsed, 'soracles.loadError'), `locale=${locale}`).toMatch(/Soracles/u);

      if (locale === 'en') continue;
      for (const key of localizedKeys) {
        expect(getAtPath(parsed, key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
    }
  });

  it('distinguishes an unavailable committed block body from a genuinely empty block', () => {
    expect(en.blocks.thisBlockIsEmpty).toBe('This block is empty');
    expect(en.blocks.bodyUnavailable).toBe('Transaction body data is unavailable for this committed block hash.');
    expect(en.blocks.bodyUnavailable).not.toBe(en.blocks.thisBlockIsEmpty);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const empty = getAtPath(parsed, 'blocks.thisBlockIsEmpty');
      const unavailable = getAtPath(parsed, 'blocks.bodyUnavailable');

      expect(typeof unavailable, `locale=${locale}`).toBe('string');
      expect(unavailable, `locale=${locale}`).not.toBe(empty);
      expect(unavailable, `locale=${locale}`).not.toBe(en.blocks.bodyUnavailable);
    }
  });

  it('keeps unqualified ancient research seeds complete but outside the shipped runtime', () => {
    const expectedPaths = collectLeafPaths(en).sort();
    expect(expectedPaths).toHaveLength(2_280);

    for (const locale of ANCIENT_LOCALES) {
      const manifest = JSON.parse(
        readFileSync(`${LOCALIZATION_DIR}/ancient/${locale}.source.json`, 'utf8')
      ) as AncientSourceManifest;

      expect(SHIPPED_LOCALES).not.toContain(locale);
      expect(SUPPORTED_LOCALES).not.toContain(locale);
      expect(existsSync(`${LOCALIZATION_DIR}/${locale}.json`), `locale=${locale} legacy runtime catalog`).toBe(false);
      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.locale).toBe(locale);
      expect(manifest.direction).toBe('ltr');
      expect(manifest.sourceStatus).toBe('unreviewed-draft');
      expect(Object.keys(manifest.records).sort()).toEqual(expectedPaths);

      for (const path of expectedPaths) {
        const record = manifest.records[path];
        const english = getAtPath(en, path);
        expect(record, `locale=${locale} key=${path}`).toBeDefined();
        expect(record.uiContext, `locale=${locale} key=${path}`).toBe(path);
        expect(record.intendedProductConcept, `locale=${locale} key=${path}`).toBe(english);
        expect(record.modernSemanticInterpretation, `locale=${locale} key=${path}`).toBe(english);
        expect(extractPlaceholders(record.ancientScript as string), `locale=${locale} key=${path}`).toEqual(
          extractPlaceholders(english as string)
        );
        expect(record.scholarshipTransliteration, `locale=${locale} key=${path}`).toBeUndefined();
        expect(record.scholarlyTransliteration, `locale=${locale} key=${path}`).toEqual(expect.any(String));
        expect(record.literalBackTranslation, `locale=${locale} key=${path}`).toEqual(expect.any(String));
        expect(record.constructionRationale, `locale=${locale} key=${path}`).toEqual(expect.any(String));
        expect(record.citedEvidence, `locale=${locale} key=${path}`).toEqual(expect.any(Array));
        if (record.constructionMode === 'protected-literal') {
          expect(record.candidateConstituents, `locale=${locale} key=${path}`).toEqual([]);
          expect(record.citedEvidence, `locale=${locale} key=${path}`).toEqual([]);
          expect(record.attestationTier, `locale=${locale} key=${path}`).toBe('transparent extension');
        } else {
          expect(record.constructionMode, `locale=${locale} key=${path}`).toBe(
            'modern-paratactic-interface-sequence'
          );
          expect(record.candidateConstituents?.length, `locale=${locale} key=${path}`).toBeGreaterThan(0);
          expect(record.citedEvidence?.length, `locale=${locale} key=${path}`).toBeGreaterThanOrEqual(2);
          expect(record.attestationTier, `locale=${locale} key=${path}`).toBe('poetic reconstruction');
        }
        expect(record.review?.semanticForwardPass).toEqual({
          status: 'pending',
          reviewer: null,
          notes: null,
        });
        expect(record.review?.blindBackTranslationPass).toEqual({
          status: 'pending',
          reviewer: null,
          backTranslation: null,
          notes: null,
        });
        expect(record.review?.protectedLiteralPass?.status).toMatch(/^(?:pending|not-applicable)$/u);
        expect(record.review?.protectedLiteralPass?.reviewer).toBeNull();
        expect(record.review?.protectedLiteralPass?.notes).toBeNull();

        for (const [citationIndex, citation] of (record.citedEvidence ?? []).entries()) {
          expect(citation.verification, `locale=${locale} key=${path} citation=${citationIndex}`).toEqual({
            status: 'pending',
            reviewer: null,
            notes: null,
          });
        }
      }
    }
  });

  it('disables message-level English fallback after exact catalog parity', () => {
    expect(i18n.global.fallbackLocale.value).toBe(false);
  });

  it('exposes exactly the locales backed by complete JSON catalogs', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...SHIPPED_LOCALES].sort());
  });

  it('keeps canonical identifiers and search grammar byte-exact across locales', () => {
    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of PROTECTED_LITERAL_KEYS) {
        expect(getAtPath(parsed, key), `locale=${locale} key=${key}`).toBe(getAtPath(en, key));
      }

      for (const key of ['homePage.searchPlaceholder', 'homePage.search.placeholder']) {
        const actual = getAtPath(parsed, key);
        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        for (const token of ['i105', 'Base58', 'nft$domain']) {
          expect(actual, `locale=${locale} key=${key} token=${token}`).toContain(token);
        }
      }
    }
  });

  it('uses the authoritative Iroha smart-contract address prefix in every shipped catalog', () => {
    expect(en.contracts.filters.contractAddressPlaceholder).toBe('irohac1…');

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      expect(getAtPath(parsed, 'contracts.filters.contractAddressPlaceholder'), `locale=${locale}`).toBe(
        en.contracts.filters.contractAddressPlaceholder
      );
      expect(raw, `locale=${locale}`).not.toContain('tairac');
    }
  });

  it('exposes only the supported contract activity and event inventory copy', () => {
    const retiredPaths = [
      'contracts.hint',
      'contracts.tabs.deployments',
      'contracts.states.loadingDeployments',
      'contracts.states.noDeployments',
      'contracts.states.deploymentError',
      'contracts.columns.address',
      'contracts.columns.codeHash',
      'contracts.columns.deployer',
      'contracts.columns.createdAt',
    ];

    expect(en.contracts.explorerHint).toBe(
      'Inspect committed contract calls, indexed event history, and live contract events.'
    );
    expect(en.contracts.filters.authorityPlaceholder).toBe('Canonical I105 account ID');
    expect(en.contracts.filters.contractAliasPlaceholder).toBe('router::universal');

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const path of retiredPaths) {
        expect(getAtPath(parsed, path), `locale=${locale} retired=${path}`).toBeUndefined();
      }
      expect(getAtPath(parsed, 'contracts.filters.authorityPlaceholder'), `locale=${locale}`).toMatch(/I105/u);
      expect(getAtPath(parsed, 'contracts.filters.contractAliasPlaceholder'), `locale=${locale}`).toBe(
        'router::universal'
      );
    }
  });

  it('keeps canonical contract validation precise and fully localized', () => {
    expect(en.contracts.validation.canonicalContractAddress).toContain('contract address');
    expect(en.contracts.validation.canonicalContractAlias).toContain('contract alias');
    expect(en.contracts.validation.noritoStringValue).toMatch(/null.*boolean.*finite number.*Torii/u);

    const expectedPlaceholders: Record<string, string[]> = {
      'contracts.validation.canonicalContractAddress': ['{field}', '{standard}'],
      'contracts.validation.canonicalContractAlias': ['{field}'],
      'contracts.validation.noritoStringValue': ['{field}'],
    };

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const [key, placeholders] of Object.entries(expectedPlaceholders)) {
        const actual = getAtPath(parsed, key);
        expect(actual, `locale=${locale} key=${key}`).toEqual(expect.any(String));
        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(placeholders);
        expect(actual, `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
    }
  });

  it('keeps strict offset-pagination limits explicit and localized', () => {
    expect(en.table.invalidPagination).toMatch(/10, 20, 50, or 100/u);
    expect(en.table.invalidPagination).toMatch(/Torii.*\{maxFetchSize\}/u);
    expect(en.table.invalidCursorPagination).toMatch(/Torii.*unpadded base64url cursor/u);
    expect(en.table.invalidCursorPagination).toMatch(/10, 20, 50, or 100/u);
    expect(en.table.fetchWindowLimit).toMatch(/\{maxFetchSize\}.*Torii offset route/u);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of ['table.invalidPagination', 'table.fetchWindowLimit']) {
        const actual = getAtPath(parsed, key);
        expect(actual, `locale=${locale} key=${key}`).toEqual(expect.any(String));
        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(['{maxFetchSize}']);
        expect(actual, `locale=${locale} key=${key}`).toMatch(/Torii/u);
      }
      expect(getAtPath(parsed, 'table.invalidCursorPagination'), `locale=${locale}`).toMatch(/Torii.*base64url/u);
    }
  });

  it('describes graph map-state nodes as persistent state maps, not a map display status', () => {
    const stateMapKeys = ['studio.graph.palette.mapState', 'studio.graph.defaultNodes.map_state.title'] as const;
    expect(stateMapKeys.map((key) => getAtPath(en, key))).toEqual(['State map', 'State map']);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const values = stateMapKeys.map((key) => getAtPath(parsed, key));

      expect(values[0], `locale=${locale}`).toBe(values[1]);
      for (const retired of INVERTED_STATE_MAP_TRANSLATIONS[locale] ?? []) {
        expect(values, `locale=${locale} retired=${retired}`).not.toContain(retired);
      }
    }
  });

  it('advertises canonical i105 account IDs rather than aliases on canonical-ID-only surfaces', () => {
    const searchCopy = [en.homePage.searchPlaceholder, en.homePage.search.placeholder];
    const canonicalIdCopy = [
      ...searchCopy,
      en.dataspaces.accountLiteralLabel,
      en.dataspaces.hint,
      en.dataspaces.accountRequired,
      en.dataspaces.accountInvalid,
      en.soracloud.validation.accountId,
    ];

    for (const value of canonicalIdCopy) {
      expect(value).toMatch(/i105/iu);
    }
    for (const value of searchCopy) {
      expect(value).not.toMatch(/account alias/iu);
    }
    expect(en.soracloud.validation.accountId).not.toMatch(/selector|alias/iu);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const searchValues = ['homePage.searchPlaceholder', 'homePage.search.placeholder'].map((key) =>
        getAtPath(parsed, key)
      );
      const accountValues = [
        'dataspaces.accountLiteralLabel',
        'dataspaces.hint',
        'dataspaces.accountRequired',
        'dataspaces.accountInvalid',
        'soracloud.validation.accountId',
      ].map((key) => getAtPath(parsed, key));

      for (const value of [...searchValues, ...accountValues]) {
        expect(value, `locale=${locale}`).toEqual(expect.any(String));
        expect(value, `locale=${locale}`).toMatch(/i105/iu);
      }
      for (const value of searchValues) {
        expect(value, `locale=${locale}`).toMatch(/Base58/u);
        expect(value, `locale=${locale}`).toContain('nft$domain');
      }
      expect(getAtPath(parsed, 'dataspaces.hint'), `locale=${locale}`).toMatch(/UAID/u);
    }
  });

  it('preserves every interpolation placeholder in every shipped JSON locale', () => {
    const expectedPaths = collectLeafPaths(en);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;

        expect(extractPlaceholders(actual), `locale=${locale} key=${key}`).toEqual(extractPlaceholders(expected));
      }
    }
  });

  it('preserves protected product, protocol, route, and code tokens in every locale', () => {
    const expectedPaths = collectLeafPaths(en);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;

        const actualTokens = extractProtectedTokens(actual);
        for (const token of extractProtectedTokens(expected)) {
          expect(actualTokens, `locale=${locale} key=${key} token=${token}`).toContain(token);
        }
      }
    }
  });

  it('does not ship translation-provider artifacts or unexpected message line breaks', () => {
    const forbiddenArtifact =
      /(?:\[\[K\d+|MYMEMORY WARNING|(?:PHX?|ZXPH|STHPH|PHPH)\d|ZXP\d*PXZ|ZXQ\d*QXZ|XQ(?:[A-Z]|\s)+QX|_TOK_\d+|__[A-Z][A-Z0-9_]*__|%(?:s|d|i|f)|§[89]|[⟦⟬][^⟧⟭]+[⟧⟭])/iu;
    const expectedPaths = collectLeafPaths(en);

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      expect(raw, `locale=${locale}`).not.toMatch(forbiddenArtifact);

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;
        if (!expected.includes('\n')) {
          expect(actual, `locale=${locale} key=${key}`).not.toContain('\n');
        }
      }
    }
  });

  it('does not silently drop sentences from multi-sentence source messages', () => {
    const expectedPaths = collectLeafPaths(en);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      // Thai normally separates sentences without terminal punctuation, so its
      // completeness is covered by the structural, token, and semantic checks.
      if (locale === 'th') continue;

      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;

        const expectedSentences = countSentenceEndings(expected);
        if (expectedSentences < 2) continue;
        expect(countTranslatedClauseEndings(actual), `locale=${locale} key=${key}`).toBeGreaterThanOrEqual(
          expectedSentences
        );
      }
    }
  });

  it('does not ship materially truncated translations', () => {
    const expectedPaths = collectLeafPaths(en);
    const compactScriptMinimums: Record<string, number> = {
      jp: 0.28,
      ko: 0.22,
      'zh-TW': 0.18,
    };

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const minimumRatio = compactScriptMinimums[locale] ?? 0.3;
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;

        const expectedLetterCount = expected.match(/\p{L}/gu)?.length ?? 0;
        if (expectedLetterCount < 30) continue;
        const actualLetterCount = actual.match(/\p{L}/gu)?.length ?? 0;
        expect(actualLetterCount / expectedLetterCount, `locale=${locale} key=${key}`).toBeGreaterThanOrEqual(
          minimumRatio
        );
      }
    }
  });

  it('does not reintroduce reviewed domain false friends', () => {
    const rules: Record<
      string,
      ReadonlyArray<{
        source: RegExp;
        forbidden: RegExp;
        pathPrefix?: string;
      }>
    > = {
      fr: [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Pagination$/iu, forbidden: /Paginaison/iu },
        { source: /^Cursor pagination$/iu, forbidden: /Paginaison/iu },
        { source: /^Mintable$/iu, forbidden: /Frappable/iu },
        { source: /\bgraph\b/iu, forbidden: /graphique/iu, pathPrefix: 'assets.provenance' },
        { source: /\bgraph\b/iu, forbidden: /graphique/iu, pathPrefix: 'tracing.' },
        { source: /\bgraph\b/iu, forbidden: /graphique/iu, pathPrefix: 'studio.' },
        { source: /\bpool\b/iu, forbidden: /piscine/iu, pathPrefix: 'studio.' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /(?:menthe|couture)/iu, pathPrefix: 'studio.' },
        { source: /\bescrow\b/iu, forbidden: /réservoir/iu, pathPrefix: 'studio.' },
        { source: /\bstore\b/iu, forbidden: /magasin/iu, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /citation/iu, pathPrefix: 'studio.' },
        { source: /\bcharge\b/iu, forbidden: /charg/iu, pathPrefix: 'studio.' },
        { source: /\bfresh\b/iu, forbidden: /frais/iu },
        { source: /\bclear\b/iu, forbidden: /clair/iu, pathPrefix: 'studio.' },
        { source: /\bassert\b/iu, forbidden: /affirm/iu, pathPrefix: 'studio.' },
      ],
      es: [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Exact hash$/iu, forbidden: /Hacienda/iu },
        { source: /hexadecimal/iu, forbidden: /hexadecimais/iu },
        { source: /^Dismiss notification$/iu, forbidden: /rechazo/iu },
        { source: /API timed out/iu, forbidden: /sin tiempo/iu },
        { source: /^Stop$/iu, forbidden: /Deje de hacerlo/iu },
        { source: /\bblock\b/iu, forbidden: /bloqueo/iu },
        { source: /\bgraph\b/iu, forbidden: /gráfic/iu, pathPrefix: 'assets.provenance' },
        { source: /\bgraph\b/iu, forbidden: /gráfic/iu, pathPrefix: 'tracing.' },
        { source: /\bgraph\b/iu, forbidden: /gráfic/iu, pathPrefix: 'studio.' },
        { source: /\bcharge\b/iu, forbidden: /carg/iu, pathPrefix: 'studio.' },
        { source: /\bstore\b/iu, forbidden: /tienda/iu, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /cita/iu, pathPrefix: 'studio.' },
        { source: /\bguard\b/iu, forbidden: /guardia/iu, pathPrefix: 'studio.' },
        { source: /\bfresh\b/iu, forbidden: /fresc/iu },
        { source: /\bassert\b/iu, forbidden: /afirm/iu, pathPrefix: 'studio.' },
      ],
      de: [
        { source: /^None$/iu, forbidden: /Keiner/u },
        { source: /^Mobile menu$/iu, forbidden: /Mobilfunk/u },
        { source: /^Pagination$/iu, forbidden: /Veröffentlichung/u },
        { source: /^Dismiss notification$/iu, forbidden: /Ablehnung/u },
        { source: /^Stop$/iu, forbidden: /Hören Sie auf/u },
        { source: /Dropped messages/iu, forbidden: /Gefallene/u },
        { source: /API timed out/iu, forbidden: /abgelaufen/iu },
        { source: /\bgraph\b/iu, forbidden: /Grafik/u, pathPrefix: 'assets.provenance' },
        { source: /\bgraph\b/iu, forbidden: /Grafik/u, pathPrefix: 'tracing.' },
        { source: /\bgraph\b/iu, forbidden: /Grafik/u, pathPrefix: 'studio.' },
        { source: /\bmap\b/iu, forbidden: /Karte/u, pathPrefix: 'studio.graph' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /(?:Minze|Münze)/u, pathPrefix: 'studio.' },
        { source: /\bguard\b/iu, forbidden: /(?:Wache|Wärter)/u, pathPrefix: 'studio.' },
        { source: /\bcall\b/iu, forbidden: /Anruf/u, pathPrefix: 'studio.' },
        {
          source: /(?<!high[ -])(?<!max )\bload(?:ing|ed)?\b/iu,
          forbidden: /(?:Lade-|Belastung|Lasten-)/u,
        },
        { source: /\bfresh\b/iu, forbidden: /Frisch/u },
        { source: /\bdeploy(?:ed|ments?|s)?\b/iu, forbidden: /Implant/iu },
      ],
      ru: [
        { source: /^None$/iu, forbidden: /Никто/u },
        { source: /^Value$/iu, forbidden: /Ценить/u },
        { source: /^Pagination$/iu, forbidden: /Страничная страница/u },
        { source: /^Cursor pagination$/iu, forbidden: /Ссылка на страницы/u },
        { source: /^Dismiss notification$/iu, forbidden: /отказ/u },
        { source: /hexadecimal/iu, forbidden: /шестидесят/u },
        { source: /API timed out/iu, forbidden: /эксплуатант/u },
        { source: /transactions?/iu, forbidden: /сделк/iu },
        { source: /\bblock\b/iu, forbidden: /блокиров/iu },
        { source: /\bgraph\b/iu, forbidden: /график/iu, pathPrefix: 'assets.provenance' },
        { source: /\bgraph\b/iu, forbidden: /график/iu, pathPrefix: 'tracing.' },
        { source: /\bgraph\b/iu, forbidden: /график/iu, pathPrefix: 'studio.' },
        { source: /\bmap\b/iu, forbidden: /карт/iu, pathPrefix: 'studio.graph' },
        { source: /\bpool\b/iu, forbidden: /бассейн/iu, pathPrefix: 'studio.' },
        { source: /\bguard\b/iu, forbidden: /охран/iu, pathPrefix: 'studio.' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /(?:мят|монет)/iu, pathPrefix: 'studio.' },
        { source: /\bstore\b/iu, forbidden: /магазин/iu, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /цитат/iu, pathPrefix: 'studio.' },
        { source: /\bcall\b/iu, forbidden: /позвон/iu, pathPrefix: 'studio.' },
        { source: /\block(?:s)?\b/iu, forbidden: /зам(?:ок|к)/iu },
      ],
      jp: [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Nonce$/u, forbidden: /^Nonce$/u },
        { source: /\bcursor\b/iu, forbidden: /カーサー/u },
        { source: /\bverifying-key\b/iu, forbidden: /verifying-key/iu },
        {
          source: /\baccount literal\b/iu,
          forbidden: /(?:文字|似なければ)/u,
          pathPrefix: 'studio.blockly.',
        },
        { source: /^Dismiss notification$/iu, forbidden: /棄却/u },
        { source: /API timed out/iu, forbidden: /API のタイムアウト/u },
        { source: /^Stop$/iu, forbidden: /^止めて$/u },
        { source: /Dropped messages/iu, forbidden: /削除された/u },
        { source: /\bpayload\b/iu, forbidden: /負荷/u },
        { source: /(?<!high[ -])(?<!max )\bload(?:ing|ed)?\b/iu, forbidden: /(?:負荷|積載|充電)/u },
        { source: /\bmap\b/iu, forbidden: /地図/u, pathPrefix: 'studio.graph' },
        { source: /\bguard\b/iu, forbidden: /警備/u, pathPrefix: 'studio.' },
        { source: /\bcall\b/iu, forbidden: /電話/u, pathPrefix: 'studio.' },
        { source: /\bstate\b/iu, forbidden: /州/u, pathPrefix: 'studio.' },
        { source: /\bimport\b/iu, forbidden: /輸入/u, pathPrefix: 'studio.' },
        { source: /\bstore\b/iu, forbidden: /店舗/u, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /引用/u, pathPrefix: 'studio.' },
        { source: /\bfresh\b/iu, forbidden: /新鮮/u },
        { source: /\bclear\b/iu, forbidden: /明確/u, pathPrefix: 'studio.' },
        { source: /\bcollateral\b/iu, forbidden: /保証券/u, pathPrefix: 'studio.' },
        { source: /\bentrypoint\b/iu, forbidden: /入場点/u, pathPrefix: 'studio.' },
        { source: /\bdeployment\b/iu, forbidden: /部署/u },
        { source: /\bhexadecimal\b/iu, forbidden: /六角形/u },
      ],
      'zh-TW': [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Nonce$/u, forbidden: /^Nonce$/u },
        { source: /\bmultisig\b/iu, forbidden: /(?:多標籤|多簽名|多位簽署|多簽證|多位籤)/u },
        { source: /\bliteral\b/iu, forbidden: /(?:字母|字體)/u },
        { source: /\bhome domain\b/iu, forbidden: /家庭/u },
        {
          source: /\bliteral\b/iu,
          forbidden: /(?:一個字面|字面上的)/u,
          pathPrefix: 'studio.blockly.tooltips.',
        },
        { source: /\b(?:call|callable)\b/iu, forbidden: /調用/u, pathPrefix: 'studio.' },
        { source: /\breturn\b/iu, forbidden: /返回/u, pathPrefix: 'studio.' },
        { source: /\bcache\b/iu, forbidden: /緩存/u },
        { source: /\baccess\b/iu, forbidden: /訪問/u },
      ],
      ko: [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Nonce$/u, forbidden: /^Nonce$/u },
        { source: /\bkey\b/iu, forbidden: /열쇠/u, pathPrefix: 'studio.' },
        { source: /\bbranch\b/iu, forbidden: /(?:지점|지부)/u, pathPrefix: 'studio.' },
        {
          source: /\bentrypoint\b/iu,
          forbidden: /(?:입력|입구)\s*지점/u,
          pathPrefix: 'studio.',
        },
        { source: /\bargument\b/iu, forbidden: /정수/u, pathPrefix: 'studio.' },
        { source: /\bweight\b/iu, forbidden: /중도/u, pathPrefix: 'studio.' },
        { source: /\bflag\b/iu, forbidden: /마크/u, pathPrefix: 'studio.' },
        { source: /\bfail closed\b/iu, forbidden: /실패\s*종료/u },
        {
          source: /\basset literal\b/iu,
          forbidden: /문자\s*그대로/u,
          pathPrefix: 'studio.blockly.',
        },
        { source: /\baccount ID or alias\b/iu, forbidden: /주민등록/u },
        { source: /\breload history and resync\b/iu, forbidden: /로드\s*기록/u },
        { source: /\btyped arguments?\b/iu, forbidden: /형식이\s*지정/u, pathPrefix: 'studio.' },
        { source: /\btyped asset pointer\b/iu, forbidden: /유형\s*자산/u, pathPrefix: 'studio.' },
        { source: /^Untitled$/u, forbidden: /제목이\s*없는/u },
        {
          source: /\b(?:account|asset definition|Name pointer) literal\b/iu,
          forbidden: /(?:말|문자)\s*그대로/u,
          pathPrefix: 'studio.blockly.',
        },
      ],
      id: [
        { source: /^Untitled$/u, forbidden: /^Untitled$/u },
        { source: /^Output$/u, forbidden: /^Output$/u },
        { source: /^Loop$/u, forbidden: /^Loop$/u },
        { source: /^Emitted$/u, forbidden: /^Emitted$/u },
        { source: /\breload history and resync\b/iu, forbidden: /Sejarah\s+reload/iu },
        { source: /\bhistory\b/iu, forbidden: /\bSejarah\b/iu, pathPrefix: 'contracts.live.' },
        { source: /\bhistory\b/iu, forbidden: /\bSejarah\b/iu, pathPrefix: 'accounts.activity.' },
        { source: /\bhistory reload failed\b/iu, forbidden: /pemandangan/iu },
        { source: /^Expires at$/iu, forbidden: /Keterlambatan/iu },
        { source: /\bhome domain\b/iu, forbidden: /Domain rumah/iu },
        { source: /^Stablecoin$/u, forbidden: /^Stablecoin$/u },
        {
          source: /\bliteral\b/iu,
          forbidden: /secara\s+(?:harfiah|literal)/iu,
          pathPrefix: 'studio.blockly.',
        },
        { source: /\btyped\b/iu, forbidden: /(?:dicetak|ditandai)/iu, pathPrefix: 'studio.' },
        { source: /\bclear\b/iu, forbidden: /dengan jelas/iu, pathPrefix: 'studio.' },
        { source: /\bflag\b/iu, forbidden: /(?:bendera|\bflag\b)/iu, pathPrefix: 'studio.' },
      ],
      tr: [
        { source: /^Until \(Unix ms\)$/u, forbidden: /^Until/iu },
        { source: /\bproof\b/iu, forbidden: /Prova/iu },
        { source: /\bbranch\b/iu, forbidden: /şube/iu, pathPrefix: 'studio.' },
        { source: /\bcommitments?\b/iu, forbidden: /yükümlül/iu, pathPrefix: 'studio.' },
        { source: /\bflag\b/iu, forbidden: /bayrak/iu, pathPrefix: 'studio.' },
        { source: /./u, forbidden: /miktarı/iu, pathPrefix: 'contracts.validation.timestampOrder' },
        { source: /./u, forbidden: /Kimliği yükselt/iu, pathPrefix: 'studio.instructionPresentation.fields.upgradeId' },
        { source: /./u, forbidden: /yük devretme/iu, pathPrefix: 'settings.failoverUnavailable' },
        {
          source: /./u,
          forbidden: /Toplum miktarı/iu,
          pathPrefix: 'studio.instructionPresentation.fields.publicAmount',
        },
        { source: /\bfailover\b/iu, forbidden: /yük devretme/iu },
        { source: /\bhistory\b/iu, forbidden: /tarih/iu, pathPrefix: 'contracts.live.' },
        { source: /\bfailure mode\b/iu, forbidden: /(?:başarısızlık|modusu)/iu },
        { source: /\balias\b/iu, forbidden: /başka isim/iu },
        { source: /\bhistory\b/iu, forbidden: /tarih/iu },
        { source: /\bmultisig\b/iu, forbidden: /(?:Çok işaretli|Çok kişilik)/u },
        { source: /\bhome domain\b/iu, forbidden: /Ev alanı/iu },
        { source: /\btyped arguments?\b/iu, forbidden: /yazılmış/iu, pathPrefix: 'studio.' },
        { source: /\btyped asset pointer\b/iu, forbidden: /göstergesi/iu, pathPrefix: 'studio.' },
        { source: /^Output$/u, forbidden: /^Üretim$/u },
        { source: /^Stablecoin$/u, forbidden: /^Stablecoin$/u },
        {
          source: /\bliteral\b/iu,
          forbidden: /(?:gerçek bir|kelimenin tam anlamıyla)/iu,
          pathPrefix: 'studio.blockly.',
        },
      ],
      uk: [
        { source: /\bmint(?:ing)?\b/iu, forbidden: /монетний двір/iu },
        { source: /\bpool\b/iu, forbidden: /басейн/iu },
        { source: /\bslash\b/iu, forbidden: /коса/iu },
        { source: /\bfailure mode\b/iu, forbidden: /провал/iu },
        { source: /\bfail closed\b/iu, forbidden: /(?:провал|відпад)/iu },
        { source: /\bstablecoin\b/iu, forbidden: /\bstablecoin\b/iu },
        { source: /\bpeers?\b/iu, forbidden: /одноліт/iu },
        { source: /\bfail(?:ure)?\b/iu, forbidden: /провал/iu },
        { source: /\btyped asset pointer\b/iu, forbidden: /Демонстраційне/u, pathPrefix: 'studio.' },
        { source: /^Expires at$/iu, forbidden: /Завершається на/iu },
        { source: /\bhome domain\b/iu, forbidden: /Домашній домен/iu },
      ],
      ar: [
        {
          source: /\bstate\b/iu,
          forbidden: /(?<!\p{L})(?:دولة|حكومة|ولاية)(?!\p{L})/u,
        },
        { source: /\bhash\b/iu, forbidden: /حشيش/u },
        { source: /\bblock\b/iu, forbidden: /حجر/u },
        { source: /\bcall\b/iu, forbidden: /(?:هاتف|مكالمة)/u, pathPrefix: 'studio.' },
        { source: /\bpool\b/iu, forbidden: /(?:بركة|مسبح)/u, pathPrefix: 'studio.' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /نعناع/u },
        { source: /\bstore\b/iu, forbidden: /متجر/u, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /اقتباس/u, pathPrefix: 'studio.' },
        { source: /\bcanonical\b/iu, forbidden: /(?:قانوني|كنسي)/u },
      ],
      he: [
        { source: /^Upgrade$/u, forbidden: /^Upgrade$/u },
        { source: /^Nonce$/u, forbidden: /^Nonce$/u },
        { source: /\bstate\b/iu, forbidden: /מדינה/u },
        { source: /\bblock\b/iu, forbidden: /(?:חגורה|אבן)/u },
        { source: /\bcall\b/iu, forbidden: /טלפון/u, pathPrefix: 'studio.' },
        { source: /\bpool\b/iu, forbidden: /בריכ/u, pathPrefix: 'studio.' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /מנטה/u },
        { source: /\bstore\b/iu, forbidden: /חנות/u, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /ציטוט/u, pathPrefix: 'studio.' },
        { source: /\bgovernance\b/iu, forbidden: /ממשלות/u },
        { source: /\bbranch\b/iu, forbidden: /סניף/u, pathPrefix: 'studio.' },
      ],
      ur: [
        { source: /^Stablecoin$/u, forbidden: /^Stablecoin$/u },
        { source: /^Torii URL$/u, forbidden: /^Torii URL$/u },
        { source: /\bstate\b/iu, forbidden: /(?:ریاست|حکومت)/u },
        { source: /\bblock\b/iu, forbidden: /پتھر/u },
        { source: /\bcall\b/iu, forbidden: /فون/u, pathPrefix: 'studio.' },
        { source: /\bpool\b/iu, forbidden: /تالاب/u, pathPrefix: 'studio.' },
        { source: /\bmint(?:ing)?\b/iu, forbidden: /ٹکسال/u },
        { source: /\bstore\b/iu, forbidden: /دکان/u, pathPrefix: 'studio.' },
        { source: /\bquote(?:s)?\b/iu, forbidden: /اقتباس/u, pathPrefix: 'studio.' },
        { source: /\bguard\b/iu, forbidden: /محافظ/u, pathPrefix: 'studio.' },
      ],
    };

    for (const [locale, localeRules] of Object.entries(rules)) {
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${locale}.json`, 'utf8')) as Record<string, unknown>;

      for (const key of collectLeafPaths(en)) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || typeof actual !== 'string') continue;

        for (const rule of localeRules) {
          if (rule.pathPrefix && !key.startsWith(rule.pathPrefix)) continue;
          if (!rule.source.test(expected)) continue;
          expect.soft(actual, `locale=${locale} key=${key}`).not.toMatch(rule.forbidden);
        }
      }
    }
  });

  it('does not reintroduce reviewed low-resource semantic false friends', () => {
    for (const [locale, retiredByPath] of Object.entries(RETIRED_LOW_RESOURCE_FALSE_FRIENDS)) {
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${locale}.json`, 'utf8')) as Record<string, unknown>;

      for (const [key, retiredValues] of Object.entries(retiredByPath)) {
        expect(retiredValues, `locale=${locale} key=${key}`).not.toContain(getAtPath(parsed, key));
      }
    }
  });

  it('does not mix unrelated writing systems into locale copy', () => {
    const protectedLiterals = PROTECTED_LITERAL_KEYS.map((key) => getAtPath(en, key)).filter(
      (value): value is string => typeof value === 'string'
    );

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const scripts = LOCALE_SCRIPTS[locale];
      expect(scripts, `locale=${locale}`).toBeDefined();
      const allowedCharacters = new RegExp(
        `[${scripts.map((script) => `\\p{Script=${script}}`).join('')}\\p{Script=Common}\\p{Script=Inherited}]`,
        'gu'
      );
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of collectLeafPaths(parsed)) {
        const actual = getAtPath(parsed, key);
        if (typeof actual !== 'string') continue;
        const withoutProtectedLiterals = protectedLiterals.reduce(
          (value, literal) => value.replaceAll(literal, ''),
          actual
        );
        const unexpected = withoutProtectedLiterals.replace(allowedCharacters, '');
        expect(unexpected, `locale=${locale} key=${key} value=${actual}`).toBe('');
      }
    }
  });

  it('keeps representative human-facing copy translated in every non-English JSON locale', () => {
    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of FULLY_LOCALIZED_SENTINEL_KEYS) {
        expect(getAtPath(parsed, key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
    }
  });

  it('localizes every redesigned navigation, search, collection, and transaction label with exact placeholders', () => {
    const keys = collectLeafPaths(en.ux).map((key) => `ux.${key}`);
    expect(keys).toHaveLength(36);
    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      for (const key of keys) {
        const expected = getAtPath(en, key) as string;
        const actual = getAtPath(parsed, key);
        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(extractPlaceholders(expected));
      }
      expect(getAtPath(parsed, 'ux.searchSyntax'), `locale=${locale}`).toContain('NFT');
      expect(getAtPath(parsed, 'ux.searchSyntax'), `locale=${locale}`).toContain('RWA');
    }
  });

  it('does not leave multiword human-facing copy identical to English', () => {
    const expectedPaths = collectLeafPaths(en);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of expectedPaths) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        if (typeof expected !== 'string' || actual !== expected) continue;
        if (!/[A-Za-z]{3}\s+[A-Za-z]{3}/u.test(expected)) continue;

        expect(IDENTICAL_MULTIWORD_ALLOWLIST.has(key), `locale=${locale} key=${key} value=${expected}`).toBe(true);
      }
    }
  });

  it('fully translates every API access-boundary message', () => {
    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of ACCESS_BOUNDARY_KEYS) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(
          extractPlaceholders(expected as string)
        );
      }
    }
  });

  it('keeps Dataspaces Diagnostic routes outside the Explorer without weakening Torii access policy', () => {
    expect(en.dataspaces.accessBoundary.diagnosticTitle).toBe('Diagnostic telemetry stays outside the Explorer');

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const title = getAtPath(parsed, 'dataspaces.accessBoundary.diagnosticTitle');
      const description = getAtPath(parsed, 'dataspaces.accessBoundary.diagnosticDescription');

      expect(title, `locale=${locale} key=dataspaces.accessBoundary.diagnosticTitle`).toMatch(/Explorer/u);
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(/Torii/u);
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(
        /\{status\}/u
      );
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(
        /Diagnostic/u
      );
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(/API/u);
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(/CIDR/u);
      expect(description, `locale=${locale} key=dataspaces.accessBoundary.diagnosticDescription`).toMatch(/Explorer/u);
    }
  });

  it('keeps VPN diagnostic classification separate from Torii access policy', () => {
    expect(en.vpn.accessBoundary.toriiAdmissionValue).toBe('Unauthenticated Diagnostic route');
    expect(en.vpn.accessBoundary.deploymentPolicyValue).toBe('May require Torii API token or admitted CIDR');

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const title = getAtPath(parsed, 'vpn.accessBoundary.title');
      const metricsDescription = getAtPath(parsed, 'vpn.accessBoundary.metricsDescription');
      const browserDescription = getAtPath(parsed, 'vpn.accessBoundary.browserDescription');
      const classificationLabel = getAtPath(parsed, 'vpn.accessBoundary.toriiAdmissionLabel');
      const classificationValue = getAtPath(parsed, 'vpn.accessBoundary.toriiAdmissionValue');
      const deploymentPolicy = getAtPath(parsed, 'vpn.accessBoundary.deploymentPolicyValue');
      const explorerBehavior = getAtPath(parsed, 'vpn.accessBoundary.explorerBehaviorValue');

      expect(title, `locale=${locale} key=vpn.accessBoundary.title`).toMatch(/Explorer/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/Torii/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/\{metrics\}/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/Diagnostic/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/VPN/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/CIDR/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/API/u);
      expect(metricsDescription, `locale=${locale} key=vpn.accessBoundary.metricsDescription`).toMatch(/Explorer/u);
      expect(browserDescription, `locale=${locale} key=vpn.accessBoundary.browserDescription`).toMatch(/Explorer/u);
      expect(browserDescription, `locale=${locale} key=vpn.accessBoundary.browserDescription`).toMatch(/Torii/u);
      expect(classificationLabel, `locale=${locale} key=vpn.accessBoundary.toriiAdmissionLabel`).toMatch(/Torii/u);
      expect(classificationValue, `locale=${locale} key=vpn.accessBoundary.toriiAdmissionValue`).toMatch(/Diagnostic/u);
      expect(classificationValue, `locale=${locale} key=vpn.accessBoundary.toriiAdmissionValue`).not.toMatch(
        /CIDR|API/u
      );
      expect(deploymentPolicy, `locale=${locale} key=vpn.accessBoundary.deploymentPolicyValue`).toMatch(/Torii/u);
      expect(deploymentPolicy, `locale=${locale} key=vpn.accessBoundary.deploymentPolicyValue`).toMatch(/CIDR/u);
      expect(deploymentPolicy, `locale=${locale} key=vpn.accessBoundary.deploymentPolicyValue`).toMatch(/API/u);
      expect(explorerBehavior, `locale=${locale} key=vpn.accessBoundary.explorerBehaviorValue`).toMatch(/Prometheus/u);
    }
  });

  it('keeps account detail labels localized for every non-English locale', () => {
    const locales = SHIPPED_LOCALES.filter((locale) => locale !== 'en');

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      expect(i18n.global.t('accounts.accountInformation'), `locale=${locale}`).not.toBe(en.accounts.accountInformation);
      expect(i18n.global.t('accounts.accountAddressI105Label', { prefix: 0 }), `locale=${locale}`).not.toBe(
        en.accounts.accountAddressI105Label.replace('{prefix}', '0')
      );
      expect(i18n.global.t('accounts.accountTransactions'), `locale=${locale}`).not.toBe(
        en.accounts.accountTransactions
      );
      expect(i18n.global.t('table.rowsPerPage'), `locale=${locale}`).not.toBe(en.table.rowsPerPage);
    }
  });

  it('keeps pending-refresh table labels localized for all shipped JSON locales', () => {
    for (const locale of SHIPPED_LOCALES) {
      i18n.global.locale.value = locale as any;

      const newData = i18n.global.t('table.newDataAvailable');
      const load = i18n.global.t('table.load');

      expect(typeof newData, `locale=${locale}`).toBe('string');
      expect(typeof load, `locale=${locale}`).toBe('string');

      if (locale !== 'en') {
        expect(newData, `locale=${locale}`).not.toBe(en.table.newDataAvailable);
        expect(load, `locale=${locale}`).not.toBe(en.table.load);
      }
    }
  });

  it('keeps econometrics navigation labels localized for all shipped JSON locales', () => {
    for (const locale of SHIPPED_LOCALES) {
      i18n.global.locale.value = locale as any;

      const nav = i18n.global.t('econometrics.nav');
      const title = i18n.global.t('econometrics.title');
      const compute = i18n.global.t('econometrics.compute');

      expect(typeof nav, `locale=${locale}`).toBe('string');
      expect(typeof title, `locale=${locale}`).toBe('string');
      expect(typeof compute, `locale=${locale}`).toBe('string');

      if (locale !== 'en') {
        expect(nav, `locale=${locale}`).not.toBe(en.econometrics.nav);
        expect(title, `locale=${locale}`).not.toBe(en.econometrics.title);
        expect(compute, `locale=${locale}`).not.toBe(en.econometrics.compute);
      }
    }
  });

  it('keeps dataspaces key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths(en.dataspaces).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { dataspaces?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.dataspaces ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('keeps scoped explorer key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths((en as Record<string, unknown>).scopedExplorer).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { scopedExplorer?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.scopedExplorer ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('keeps sorafs key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths((en as Record<string, unknown>).sorafs).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { sorafs?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.sorafs ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('does not retain localization copy for retired product surfaces', () => {
    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      expect(getAtPath(parsed, 'sorafs.moderation'), `locale=${locale}`).toBeUndefined();
      expect(getAtPath(parsed, 'sorafs.connect'), `locale=${locale}`).toBeUndefined();
      expect(getAtPath(parsed, 'sorafs.proposal'), `locale=${locale}`).toBeUndefined();
      expect(getAtPath(parsed, 'telemetry.ethstatsDerivedFromCommit'), `locale=${locale}`).toBeUndefined();
      expect(
        getAtPath(parsed, 'soracloud.accessBoundary.retiredRoutesDescription'),
        `locale=${locale}`
      ).toBeUndefined();
      expect(
        getAtPath(parsed, 'governance.accessBoundary.retiredCouncilDescription'),
        `locale=${locale}`
      ).toBeUndefined();
    }
  });

  it('keeps VPN key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths((en as Record<string, unknown>).vpn).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { vpn?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.vpn ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('preserves public VPN profile terminology across every locale', () => {
    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      expect(getAtPath(parsed, 'vpn.profile.title'), `locale=${locale}`).toMatch(/VPN/u);
      expect(getAtPath(parsed, 'vpn.profile.description'), `locale=${locale}`).toMatch(/Torii/u);
      expect(getAtPath(parsed, 'vpn.profile.unavailable'), `locale=${locale}`).toMatch(/VPN/u);
      expect(getAtPath(parsed, 'vpn.profile.loadError'), `locale=${locale}`).toMatch(/VPN/u);
      expect(getAtPath(parsed, 'vpn.profile.fields.tlsServerName'), `locale=${locale}`).toMatch(/TLS/u);
      expect(getAtPath(parsed, 'vpn.profile.fields.mtuBytes'), `locale=${locale}`).toBe('MTU');
      expect(getAtPath(parsed, 'vpn.profile.fields.relayMldsa65PublicKey'), `locale=${locale}`).toMatch(/ML-DSA-65/u);
      expect(getAtPath(parsed, 'vpn.profile.fields.tlsSpkiDigest'), `locale=${locale}`).toBe('TLS SPKI SHA-256');
      expect(getAtPath(parsed, 'vpn.profile.fields.relayCertificateDigest'), `locale=${locale}`).toMatch(/SHA-256/u);
    }
  });

  it('fully localizes every human-facing field in the strict public VPN profile DTO', () => {
    const keys = [
      'vpn.profile.fields.defaultExitClass',
      'vpn.profile.fields.dnsPushInterval',
      'vpn.profile.fields.meterFamily',
      'vpn.profile.fields.routePushes',
      'vpn.profile.fields.excludedRoutes',
      'vpn.profile.fields.dnsServers',
      'vpn.profile.fields.tunnelAddresses',
      'vpn.profile.fields.leaseFee',
      'vpn.profile.fields.settlementGrace',
      'vpn.profile.fields.flowLabelBits',
      'vpn.profile.fields.paddingBudget',
      'vpn.profile.fields.relayId',
      'vpn.profile.fields.relayMldsa65PublicKey',
      'vpn.profile.fields.descriptorCommit',
      'vpn.profile.fields.relayCertificateDigest',
    ] as const;

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;

      for (const key of keys) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);
        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect((actual as string).trim().length, `locale=${locale} key=${key}`).toBeGreaterThan(0);
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
      }
    }
  });

  it('describes the exact public telemetry routes without inventing a propagation snapshot endpoint', () => {
    expect(en.telemetry.operatorBoundary.publicDescription).toBe(
      'This page uses the public Explorer health snapshot, the exact `/v1/telemetry/peers-info` snapshot, and the `/v1/telemetry/live` SSE stream. Propagation history is available only inside the initial and live SSE payloads; there is no separate propagation snapshot route and no anonymous fallback for operator endpoints.'
    );

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const description = getAtPath(parsed, 'telemetry.operatorBoundary.publicDescription');

      expect(description, `locale=${locale}`).toMatch(/Explorer/u);
      expect(description, `locale=${locale}`).toMatch(/`\/v1\/telemetry\/peers-info`/u);
      expect(description, `locale=${locale}`).toMatch(/`\/v1\/telemetry\/live`/u);
      expect(description, `locale=${locale}`).toMatch(/SSE/u);
      expect(description, `locale=${locale}`).not.toMatch(/\/v1\/telemetry\/(?:propagation|history)/u);
    }
  });

  it('keeps core VPN labels localized for non-English shipped JSON locales', () => {
    const keys = [
      'vpn.title',
      'vpn.overviewTitle',
      'vpn.runtimeState',
      'vpn.unavailable',
      'vpn.statusLabels.active',
    ] as const;

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of keys) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
      }
    }
  });

  it('keeps Soracloud key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths((en as Record<string, unknown>).soracloud).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { soracloud?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.soracloud ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('does not leave the Soracloud namespace byte-identical to English in shipped JSON locales', () => {
    const expected = JSON.stringify((en as Record<string, unknown>).soracloud);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { soracloud?: Record<string, unknown> };
      const actual = JSON.stringify(parsed.soracloud ?? {});

      expect(actual, `locale=${locale}`).not.toBe(expected);
    }
  });

  it('resolves Soracloud labels to strings instead of raw keys across locales', () => {
    const locales = SHIPPED_LOCALES;

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      expect(i18n.global.t('soracloud.title'), `locale=${locale}`).not.toBe('soracloud.title');
      expect(i18n.global.t('soracloud.serviceInspector'), `locale=${locale}`).not.toBe('soracloud.serviceInspector');
      expect(i18n.global.t('soracloud.inspect'), `locale=${locale}`).not.toBe('soracloud.inspect');
    }
  });

  it('keeps Studio key parity across all shipped JSON locales', () => {
    const expected = collectLeafPaths((en as Record<string, unknown>).studio).sort();

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { studio?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.studio ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('does not leave the Studio namespace byte-identical to English in shipped JSON locales', () => {
    const expected = JSON.stringify((en as Record<string, unknown>).studio);

    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { studio?: Record<string, unknown> };
      const actual = JSON.stringify(parsed.studio ?? {});

      expect(actual, `locale=${locale}`).not.toBe(expected);
    }
  });

  it('keeps core Studio labels localized across all non-English JSON locales', () => {
    const keys = ['studio.title', 'studio.deployAction', 'studio.compileTitle', 'studio.fields.dataspace'] as const;

    for (const localeFile of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = localeFile.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${locale}.json`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of keys) {
        expect(getAtPath(parsed, key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
    }
  });

  it('does not ship translation quota warning artifacts in locale packs', () => {
    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      expect(raw, `locale=${locale}`).not.toContain('MYMEMORY WARNING');
    }
  });

  it('keeps dataspaces/scoped placeholder tokens intact across all shipped JSON locales', () => {
    const keys = ['dataspaces.updatedAt', 'scopedExplorer.activeNode', 'scopedExplorer.dataspaceContext'] as const;

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of keys) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(typeof expected, `key=${key}`).toBe('string');

        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(
          extractPlaceholders(expected as string)
        );
      }
    }
  });

  it('keeps core dataspaces/scoped labels localized for non-English shipped JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json') && file !== 'en.json');
    const keys = [
      'dataspaces.overviewTitle',
      'dataspaces.detailTitle',
      'dataspaces.backToOverview',
      'dataspaces.publicNodes.title',
      'scopedExplorer.title',
      'scopedExplorer.noNodes',
      'scopedExplorer.exitToDataspace',
    ] as const;

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of keys) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
      }
    }
  });

  it('keeps transactions key parity across all shipped JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json'));
    const expected = collectLeafPaths(en.transactions).sort();

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { transactions?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.transactions ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('keeps tracing key parity across all shipped JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json'));
    const expected = collectLeafPaths((en as Record<string, unknown>).tracing).sort();

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { tracing?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.tracing ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('keeps econometrics key parity across all shipped JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json'));
    const expected = collectLeafPaths(en.econometrics).sort();

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { econometrics?: Record<string, unknown> };
      const actual = collectLeafPaths(parsed.econometrics ?? {}).sort();

      expect(actual, `locale=${locale}`).toEqual(expected);
    }
  });

  it('keeps econometrics notes on authoritative Torii data and omits retired browser-local churn copy', () => {
    expect(Object.keys(RETIRED_ECONOMETRICS_SCAN_PATTERNS).sort()).toEqual([...SHIPPED_LOCALES].sort());

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { econometrics?: Record<string, unknown> };
      const econometrics = parsed.econometrics ?? {};
      const notes = [
        econometrics.velocityNote ?? '',
        econometrics.issuanceNote ?? '',
        econometrics.activityNote ?? '',
      ].join(' ');

      expect(notes, `locale=${locale}`).toContain('Torii');
      expect(notes, `locale=${locale}`).not.toMatch(RETIRED_ECONOMETRICS_SCAN_PATTERNS[locale]);

      for (const key of RETIRED_ECONOMETRICS_CHURN_KEYS) {
        expect(econometrics, `locale=${locale} key=${key}`).not.toHaveProperty(key);
      }
    }
  });

  it('keeps telemetry ops-console keys available across all shipped JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json'));
    const requiredTelemetryKeys = [
      'filterAllNodes',
      'filterOnlineNodes',
      'filterLaggingNodes',
      'filterUnsupportedNodes',
      'dataTrustSource',
      'dataTrustSampleAge',
      'dataSourceLiveSse',
      'dataSourceSnapshot',
      'dataSourceMixed',
      'dataSourceUnavailable',
      'dataFreshnessScale',
      'dataFresh',
      'dataDelayed',
      'dataStale',
      'dataUnknown',
      'noFilteredNodes',
      'pinNode',
      'unpinNode',
      'compareNode',
      'clearCompare',
      'nodeCompareTitle',
      'nodeCompareHint',
      'metric',
      'pinnedNode',
      'rawEvents',
      'searchEvents',
      'searchEventsPlaceholder',
      'copyEventJson',
      'exportEvents',
      'eventsExported',
      'noEvents',
      'eventSnapshotPeersInfo',
      'eventSnapshotPropagation',
      'eventSseFirst',
      'eventSsePeerInfo',
      'eventSsePeerStatus',
      'eventSsePropagation',
      'eventSseNetworkStatus',
      'eventUnknown',
      'firstSeenAt',
      'lastSeenAt',
      'observedAt',
      'details',
      'queueCapacity',
      'statusRtt',
      'statusRttAverage',
      'statusRttP95',
      'propagationTime',
    ];

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as { telemetry?: Record<string, unknown> };
      const telemetry = parsed.telemetry ?? {};

      for (const key of requiredTelemetryKeys) {
        expect(Object.prototype.hasOwnProperty.call(telemetry, key), `locale=${locale}, key=${key}`).toBe(true);
      }
    }
  });

  it('keeps telemetry ops action labels locale-native across non-English JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json'));
    const enRaw = readFileSync(`${localizationDir}/en.json`, 'utf8');
    const enTelemetry = (JSON.parse(enRaw) as { telemetry?: Record<string, string> }).telemetry ?? {};
    const actionKeys = [
      'searchEvents',
      'searchEventsPlaceholder',
      'copyEventJson',
      'exportEvents',
      'eventsExported',
    ] as const;

    for (const file of localeFiles) {
      const locale = file.replace(/\.json$/, '');
      if (locale === 'en') continue;

      const raw = readFileSync(`${localizationDir}/${file}`, 'utf8');
      const telemetry = (JSON.parse(raw) as { telemetry?: Record<string, string> }).telemetry ?? {};

      for (const key of actionKeys) {
        expect(telemetry[key], `locale=${locale}, key=${key}`).not.toBe(enTelemetry[key]);
      }
    }
  });

  it('keeps full telemetry ops-console labels localized across all non-English JSON locales', () => {
    const localizationDir = dirname(fileURLToPath(import.meta.url));
    const localeFiles = readdirSync(localizationDir).filter((file) => file.endsWith('.json') && file !== 'en.json');
    const enRaw = readFileSync(`${localizationDir}/en.json`, 'utf8');
    const enTelemetry = (JSON.parse(enRaw) as { telemetry?: Record<string, string> }).telemetry ?? {};
    const keys = [
      'filterAllNodes',
      'filterOnlineNodes',
      'filterLaggingNodes',
      'filterUnsupportedNodes',
      'dataTrustSource',
      'dataTrustSampleAge',
      'dataSourceLiveSse',
      'dataSourceSnapshot',
      'dataSourceMixed',
      'dataSourceUnavailable',
      'dataFreshnessScale',
      'dataFresh',
      'dataDelayed',
      'dataStale',
      'dataUnknown',
      'noFilteredNodes',
      'pinNode',
      'unpinNode',
      'compareNode',
      'clearCompare',
      'nodeCompareTitle',
      'nodeCompareHint',
      'metric',
      'pinnedNode',
      'rawEvents',
      'noEvents',
      'eventSnapshotPeersInfo',
      'eventSnapshotPropagation',
      'eventSseFirst',
      'eventSsePeerInfo',
      'eventSsePeerStatus',
      'eventSsePropagation',
      'eventSseNetworkStatus',
      'eventUnknown',
      'firstSeenAt',
      'lastSeenAt',
      'observedAt',
      'details',
      'queueCapacity',
      'statusRtt',
      'statusRttAverage',
      'statusRttP95',
      'propagationTime',
    ] as const;

    for (const localeFile of localeFiles) {
      const locale = localeFile.replace(/\.json$/, '');
      const raw = readFileSync(`${localizationDir}/${locale}.json`, 'utf8');
      const telemetry = (JSON.parse(raw) as { telemetry?: Record<string, string> }).telemetry ?? {};

      for (const key of keys) {
        expect(telemetry[key], `locale=${locale}, key=${key}`).not.toBe(enTelemetry[key]);
      }
    }
  });

  it('exposes and localizes every strict AssetDefinition detail field', () => {
    const expectedKeys = [
      'alias',
      'aliasBoundAt',
      'aliasGraceUntil',
      'aliasLeaseExpiry',
      'aliasStatus',
      'balanceScopePolicy',
      'confidentialPolicy',
      'description',
      'logo',
      'name',
      'numericSpec',
      'totalQuantity',
    ];
    const translatedKeys = expectedKeys.filter((key) => !['alias', 'description', 'logo', 'name'].includes(key));
    const englishFields = en.assets.definitionFields as Record<string, string>;

    expect(Object.keys(englishFields).sort()).toEqual(expectedKeys);
    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const parsed = JSON.parse(readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8')) as Record<string, unknown>;
      const fields = getAtPath(parsed, 'assets.definitionFields') as Record<string, unknown>;

      expect(Object.keys(fields ?? {}).sort(), `locale=${locale}`).toEqual(expectedKeys);
      for (const key of expectedKeys) {
        expect(typeof fields[key], `locale=${locale} key=${key}`).toBe('string');
        expect((fields[key] as string).trim().length, `locale=${locale} key=${key}`).toBeGreaterThan(0);
      }
      if (locale !== 'en') {
        for (const key of translatedKeys) {
          expect(fields[key], `locale=${locale} key=${key}`).not.toBe(englishFields[key]);
        }
      }
    }
  });

  it('localizes runtime settings labels across all locales', () => {
    i18n.global.locale.value = 'en';
    const enLanguage = i18n.global.t('settings.language');
    const enTheme = i18n.global.t('settings.theme');

    for (const locale of i18n.global.availableLocales) {
      i18n.global.locale.value = locale as any;

      const labelLanguage = i18n.global.t('settings.language');
      const labelTheme = i18n.global.t('settings.theme');

      // Ensure non-English locales provide their own labels (not falling back to English).
      if (locale !== 'en') {
        expect(labelLanguage, `locale=${locale}`).not.toBe(enLanguage);
        expect(labelTheme, `locale=${locale}`).not.toBe(enTheme);
      }

      // Ensure the keys always resolve to something human readable.
      expect(labelLanguage, `locale=${locale}`).not.toBe('settings.language');
      expect(labelTheme, `locale=${locale}`).not.toBe('settings.theme');
    }
  });
});
