import type { TabItem } from '../index';

export type TabAssets = 'assets' | 'nft';

export const ASSETS_OPTIONS: TabItem<TabAssets>[] = [
  { i18nKey: 'assets.numerics', value: 'assets' },
  { i18nKey: 'assets.nfts', value: 'nft' },
];

export type TabAssetsList = 'assets' | 'holders' | 'nft' | 'rwa';

export const ASSETS_LIST_OPTIONS: TabItem<TabAssetsList>[] = [
  { i18nKey: 'assets.numerics', value: 'assets' },
  { i18nKey: 'assets.assetHolders', value: 'holders' },
  { i18nKey: 'assets.nfts', value: 'nft' },
  { i18nKey: 'assets.rwas', value: 'rwa' },
];
