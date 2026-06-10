import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureLocaleLoaded, i18n, SUPPORTED_LOCALES } from './index';
import en from './en.json';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const LOCALIZATION_DIR = dirname(fileURLToPath(import.meta.url));
const SHIPPED_LOCALE_FILES = readdirSync(LOCALIZATION_DIR).filter((file) => file.endsWith('.json'));
const SHIPPED_LOCALES = SHIPPED_LOCALE_FILES.map((file) => file.replace(/\.json$/, ''));
const SHIPPED_NON_EN_LOCALE_FILES = SHIPPED_LOCALE_FILES.filter((file) => file !== 'en.json');
const SORAFS_SENTINEL_KEYS = [
  'sorafs.connect.title',
  'sorafs.connect.description',
  'sorafs.connect.createSession',
  'sorafs.connect.openWallet',
  'sorafs.connect.approvedAccount',
  'sorafs.connect.sessionStates.waiting_for_wallet',
  'sorafs.connect.sessionStates.submitted',
  'sorafs.proposal.title',
  'sorafs.proposal.submitWallet',
  'sorafs.proposal.walletSubmissionHelp',
  'sorafs.proposal.descriptionAdd',
  'sorafs.proposal.descriptionRemove',
  'sorafs.proposal.payload.titleAdd',
  'sorafs.proposal.payload.titleRemove',
  'sorafs.proposal.payload.motivationAdd',
  'sorafs.proposal.payload.motivationRemove',
  'sorafs.proposal.payload.expectedImpactAdd',
  'sorafs.proposal.payload.expectedImpactRemove',
  'sorafs.proposal.payload.targetReasonAdd',
  'sorafs.proposal.payload.targetReasonRemove',
  'sorafs.proposal.payload.cidEvidenceDescriptionAdd',
  'sorafs.proposal.payload.cidEvidenceDescriptionRemove',
  'sorafs.proposal.payload.urlEvidenceDescriptionAdd',
  'sorafs.proposal.payload.urlEvidenceDescriptionRemove',
  'sorafs.moderation.status.clear',
  'sorafs.moderation.status.mixedBlocked',
  'sorafs.moderation.summary.clear',
  'sorafs.moderation.summary.linksBlocked',
] as const;

describe('localization: historic poetic locales', () => {
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
    return Array.from(new Set(value.match(/\{[^{}]+\}/g) ?? [])).sort();
  };

  afterEach(() => {
    i18n.global.locale.value = 'en';
  });

  it('registers poetic cuneiform labels for core navigation strings', () => {
    i18n.global.locale.value = 'akk';

    expect(i18n.global.t('search')).toBe('𒅆𒄿 (seek the hidden trace)');
    expect(i18n.global.t('blocks.blocks')).toBe('𒆳𒁾 (Blocks)');
    expect(i18n.global.t('noData')).toBe('𒁾 𒋫 𒈠 (the tablet is silent)');
    expect(i18n.global.t('governance.nav')).toBe('𒄿𒉌𒈠 (Council)');
    expect(i18n.global.t('dataspaces.nav')).toBe('𒈨𒌍𒆠 (realms of records)');
    expect(i18n.global.t('transactions.multisig')).toBe('𒈨𒌍𒋗 (many-seal decree)');
  });

  it('keeps account style placeholders intact after locale sanitization', () => {
    i18n.global.locale.value = 'akk';

    expect(i18n.global.t('homePage.search.samples.account')).toBe(SAMPLE_ACCOUNT_ID);
    expect(i18n.global.t('homePage.search.placeholder')).toContain('I105/sora/norito account');
  });

  it('registers poetic hieroglyph labels for core navigation strings', () => {
    i18n.global.locale.value = 'egy';

    expect(i18n.global.t('search')).toBe('𓂋𓈖');
    expect(i18n.global.t('blocks.blocks')).toBe('𓈖𓃭');
    expect(i18n.global.t('noData')).toBe('𓏞𓏏');
    expect(i18n.global.t('governance.nav')).toBe('𓅓𓂋𓏏');
    expect(i18n.global.t('dataspaces.nav')).toBe('𓏞𓈖𓎡𓏏');
    expect(i18n.global.t('transactions.multisig')).toBe('𓂋𓈖 𓎛𓎛');
  });

  it('keeps account style placeholders intact for hieroglyph locale sanitization', () => {
    i18n.global.locale.value = 'egy';

    expect(i18n.global.t('homePage.search.samples.account')).toBe(SAMPLE_ACCOUNT_ID);
    expect(i18n.global.t('homePage.search.placeholder')).toContain('I105/sora/norito account');
  });

  it('keeps account detail labels localized for programmatic non-English locales', () => {
    const locales = [
      'tr',
      'si',
      'ta',
      'id',
      'am',
      'az',
      'hy',
      'ka',
      'th',
      'zh-TW',
      'kh',
      'ko',
      'my',
      'dz',
      'uk',
      'ur',
      'he',
      'ar',
      'akk',
      'egy',
    ] as const;

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      expect(i18n.global.t('accounts.accountInformation'), `locale=${locale}`).not.toBe(en.accounts.accountInformation);
      expect(i18n.global.t('accounts.accountAddressI105Label', { prefix: 0 }), `locale=${locale}`).not.toBe(
        en.accounts.accountAddressI105Label.replace('{prefix}', '0')
      );
      expect(i18n.global.t('accounts.accountTransactions'), `locale=${locale}`).not.toBe(en.accounts.accountTransactions);
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

  it('keeps core SoraFS moderation/connect/proposal labels localized for all non-English shipped JSON locales', () => {
    for (const file of SHIPPED_NON_EN_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of SORAFS_SENTINEL_KEYS) {
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

  it('keeps core SoraFS moderation/connect/proposal labels localized for poetic locales', () => {
    const locales = ['akk', 'egy'] as const;

    for (const locale of locales) {
      const messageTree = i18n.global.getLocaleMessage(locale) as Record<string, unknown>;

      for (const key of SORAFS_SENTINEL_KEYS) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(messageTree, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(actual, `locale=${locale} key=${key}`).not.toBe(expected);
        expect(extractPlaceholders(actual as string), `locale=${locale} key=${key}`).toEqual(
          extractPlaceholders(expected as string)
        );
      }
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

  it('keeps core VPN labels localized for programmatic poetic locales', () => {
    const locales = ['akk', 'egy'] as const;
    const keys = [
      'vpn.title',
      'vpn.overviewTitle',
      'vpn.runtimeState',
      'vpn.unavailable',
      'vpn.statusLabels.active',
    ] as const;

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      for (const key of keys) {
      expect(i18n.global.t(key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
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
    const locales = [
      ...SHIPPED_LOCALES,
      'akk',
      'egy',
    ];

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      expect(i18n.global.t('soracloud.title'), `locale=${locale}`).not.toBe('soracloud.title');
      expect(i18n.global.t('soracloud.serviceInspector'), `locale=${locale}`).not.toBe('soracloud.serviceInspector');
      expect(i18n.global.t('soracloud.inspect'), `locale=${locale}`).not.toBe('soracloud.inspect');
    }
  });

  it('keeps representative Soracloud labels localized for poetic locales', () => {
    const locales = ['akk', 'egy'] as const;
    const keys = [
      'soracloud.title',
      'soracloud.serviceInspector',
      'soracloud.queryIdle',
      'soracloud.validation.accountId',
    ] as const;

    for (const locale of locales) {
      i18n.global.locale.value = locale as any;

      for (const key of keys) {
        expect(i18n.global.t(key), `locale=${locale} key=${key}`).not.toBe(getAtPath(en, key));
      }
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
    const keys = [
      'studio.title',
      'studio.deployAction',
      'studio.compileTitle',
      'studio.fields.dataspace',
    ] as const;

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
    const keys = [
      'dataspaces.updatedAt',
      'scopedExplorer.activeNode',
      'scopedExplorer.dataspaceContext',
    ] as const;

    for (const file of SHIPPED_LOCALE_FILES) {
      const locale = file.replace(/\.json$/, '');
      const raw = readFileSync(`${LOCALIZATION_DIR}/${file}`, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of keys) {
        const expected = getAtPath(en, key);
        const actual = getAtPath(parsed, key);

        expect(typeof actual, `locale=${locale} key=${key}`).toBe('string');
        expect(typeof expected, `key=${key}`).toBe('string');

        expect(
          extractPlaceholders(actual as string),
          `locale=${locale} key=${key}`
        ).toEqual(extractPlaceholders(expected as string));
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
      'dataSourceFallbackPeers',
      'dataSourceMixed',
      'dataSourceUnavailable',
      'dataFreshnessScale',
      'dataFresh',
      'dataDelayed',
      'dataStale',
      'dataUnknown',
      'peerFallbackNotice',
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
      'eventFallbackPeers',
      'eventSseFirst',
      'eventSsePeerInfo',
      'eventSsePeerStatus',
      'eventSsePropagation',
      'eventSseNetworkStatus',
      'eventUnknown',
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
    const actionKeys = ['searchEvents', 'searchEventsPlaceholder', 'copyEventJson', 'exportEvents', 'eventsExported'] as const;

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
      'dataSourceFallbackPeers',
      'dataSourceMixed',
      'dataSourceUnavailable',
      'dataFreshnessScale',
      'dataFresh',
      'dataDelayed',
      'dataStale',
      'dataUnknown',
      'peerFallbackNotice',
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
      'eventFallbackPeers',
      'eventSseFirst',
      'eventSsePeerInfo',
      'eventSsePeerStatus',
      'eventSsePropagation',
      'eventSseNetworkStatus',
      'eventUnknown',
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
