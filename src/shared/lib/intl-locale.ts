/** App language codes that differ from their BCP 47 tag, or have no Intl data. */
const INTL_ALIASES: Readonly<Record<string, string>> = {
  jp: 'ja',
  kh: 'km',
  akk: 'en',
  egy: 'en',
};

/** The Intl locale for an app language code, falling back to English when unsupported. */
export function intlLocale(appLocale: string): string {
  const tag = INTL_ALIASES[appLocale] ?? appLocale;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0 ? tag : 'en';
  } catch {
    return 'en';
  }
}
