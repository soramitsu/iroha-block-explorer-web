export type AncientFontLocale = 'akk' | 'egy';

type FontLoader = () => Promise<unknown>;

const defaultLoaders: Record<AncientFontLocale, FontLoader> = {
  akk: async () => await import('./akk.css'),
  egy: async () => await import('./egy.css'),
};

const loadedLocales = new Set<AncientFontLocale>();

function isAncientFontLocale(locale: string): locale is AncientFontLocale {
  return locale === 'akk' || locale === 'egy';
}

export async function loadAncientFontForLocale(
  locale: string,
  {
    loaders = defaultLoaders,
    loaded = loadedLocales,
  }: {
    loaders?: Record<AncientFontLocale, FontLoader>;
    loaded?: Set<AncientFontLocale>;
  } = {}
): Promise<boolean> {
  if (!isAncientFontLocale(locale)) return false;
  if (loaded.has(locale)) return true;

  await loaders[locale]();
  loaded.add(locale);
  return true;
}
