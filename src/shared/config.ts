export const menu = [
  { i18nKey: 'blocks.blocks', to: '/blocks', names: ['blocks-list', 'blocks-details'] },
  {
    i18nKey: 'assets.assetsAndNFTAndRWA',
    to: '/assets',
    names: ['assets', 'asset-details', 'nfts', 'nft-details', 'rwas', 'rwa-details'],
  },
  { i18nKey: 'econometrics.nav', to: '/econometrics', names: ['econometrics'] },
  { i18nKey: 'dataspaces.nav', to: '/dataspaces', names: ['dataspaces', 'dataspaces-details'] },
  { i18nKey: 'domains.domains', to: '/domains', names: ['domains-list', 'domain-details'] },
  { i18nKey: 'accounts.accounts', to: '/accounts', names: ['accounts-list', 'account-details'] },
  { i18nKey: 'transactions.transactions', to: '/transactions', names: ['transactions-list', 'transaction-details'] },
  { i18nKey: 'tracing.nav', to: '/tracing', names: ['tracing-workspace'] },
  { i18nKey: 'studio.nav', to: '/studio', names: ['kotodama-studio'] },
  { i18nKey: 'governance.nav', to: '/governance', names: ['governance-dashboard'] },
  { i18nKey: 'contracts.nav', to: '/contracts', names: ['smart-contracts'] },
  { i18nKey: 'telemetry.telemetry', to: '/telemetry', names: ['telemetry'] },
  { i18nKey: 'vpn.nav', to: '/vpn', names: ['vpn-stats'] },
  { i18nKey: 'kaigi.nav', to: '/kaigi/relays', names: ['kaigi-relays'] },
  { i18nKey: 'soracloud.nav', to: '/soracloud', names: ['soracloud'] },
  { i18nKey: 'sorafs.registryNav', to: '/sorafs/registry', names: ['sorafs-registry'] },
  { i18nKey: 'zkTelemetry.nav', to: '/zk/telemetry', names: ['zk-telemetry'] },
];

export interface MenuItem {
  i18nKey: string
  to: string
  names: string[]
}

export interface MenuGroup {
  key: 'explore' | 'analytics' | 'network' | 'build' | 'services'
  i18nKey: string
  hintKey: string
  items: MenuItem[]
}

const menuItem = (to: string): MenuItem => {
  const item = menu.find((entry) => entry.to === to);
  if (!item) throw new Error(`Unknown menu destination: ${to}`);
  return item;
};

/** Dashboards are reached from the grouped header only; the home page keeps `menu`. */
export const dashboardsMenuItem: MenuItem = {
  i18nKey: 'dashboards.nav',
  to: '/dashboards/network',
  names: ['dashboard-network', 'dashboard-activity', 'dashboard-ledger'],
};

/** Header navigation: every `menu` destination appears in exactly one group. */
export const menuGroups: MenuGroup[] = [
  {
    key: 'explore',
    i18nKey: 'navigation.groups.explore',
    hintKey: 'navigation.hints.explore',
    items: ['/blocks', '/transactions', '/accounts', '/domains', '/assets', '/dataspaces'].map(menuItem),
  },
  {
    key: 'analytics',
    i18nKey: 'navigation.groups.analytics',
    hintKey: 'navigation.hints.analytics',
    items: [dashboardsMenuItem, menuItem('/econometrics')],
  },
  {
    key: 'network',
    i18nKey: 'navigation.groups.network',
    hintKey: 'navigation.hints.network',
    items: ['/telemetry', '/governance', '/zk/telemetry', '/kaigi/relays', '/vpn'].map(menuItem),
  },
  {
    key: 'build',
    i18nKey: 'navigation.groups.build',
    hintKey: 'navigation.hints.build',
    items: ['/contracts', '/studio', '/tracing'].map(menuItem),
  },
  {
    key: 'services',
    i18nKey: 'navigation.groups.services',
    hintKey: 'navigation.hints.services',
    items: ['/soracloud', '/sorafs/registry'].map(menuItem),
  },
];

export const langOptions = [
  { label: 'EN - English', value: 'en' },
  { label: 'FR - Français', value: 'fr' },
  { label: 'ES - Español', value: 'es' },
  { label: 'DE - Deutsch', value: 'de' },
  { label: 'RU - Русский', value: 'ru' },
  { label: 'JP - 日本', value: 'jp' },
  { label: 'DV - ދިވެހި', value: 'dv' },
  { label: 'DZ - རྫོང་ཁ', value: 'dz' },
  { label: 'NE - नेपाली', value: 'ne' },
  { label: 'MY - မြန်မာ', value: 'my' },
  { label: 'KH - ខ្មែរ', value: 'kh' },
  { label: 'ZH-TW - 繁體中文', value: 'zh-TW' },
  { label: 'KO - 한국어', value: 'ko' },
  { label: 'TH - ไทย', value: 'th' },
  { label: 'AM - አማርኛ', value: 'am' },
  { label: 'AZ - Azərbaycan', value: 'az' },
  { label: 'HY - Հայերեն', value: 'hy' },
  { label: 'KA - ქართული', value: 'ka' },
  { label: 'TR - Türkçe', value: 'tr' },
  { label: 'SI - සිංහල', value: 'si' },
  { label: 'TA - தமிழ்', value: 'ta' },
  { label: 'ID - Bahasa Indonesia', value: 'id' },
  { label: 'AKK - 𒀝𒅗𒁺', value: 'akk' },
  { label: '𓆣𓂀𓏏', value: 'egy' },
  { label: 'UK - Українська', value: 'uk' },
  { label: 'UR - اردو', value: 'ur' },
  { label: 'HE - עברית', value: 'he' },
  { label: 'AR - العربية', value: 'ar' },
];
