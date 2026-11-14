import { createI18n } from 'vue-i18n';
import en from './en.json';

type LocaleMessages = typeof en;

type LocaleMessageValue = string | number | boolean | LocaleMessageObject | LocaleMessageValue[];
interface LocaleMessageObject {
  [key: string]: LocaleMessageValue;
}

function escapeLinkedAt(value: string): string {
  return value.replace(/@/g, "{'@'}");
}

function sanitizeLocaleValue(value: LocaleMessageValue): LocaleMessageValue {
  if (typeof value === 'string') {
    return escapeLinkedAt(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLocaleValue(entry));
  }
  if (value && typeof value === 'object') {
    const sanitized: LocaleMessageObject = {};
    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = sanitizeLocaleValue(entry);
    }
    return sanitized;
  }
  return value;
}

export const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'jp',
  'dv',
  'uk',
  'ur',
  'he',
  'ar',
  'dz',
  'ne',
  'my',
  'zh-TW',
  'kh',
  'ko',
  'th',
  'am',
  'az',
  'hy',
  'ka',
  'tr',
  'si',
  'ta',
  'id',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

const jsonLocaleLoaders: Record<Exclude<SupportedLocale, 'en'>, () => Promise<LocaleMessages>> = {
  fr: async () => (await import('./fr.json')).default as LocaleMessages,
  es: async () => (await import('./es.json')).default as LocaleMessages,
  de: async () => (await import('./de.json')).default as LocaleMessages,
  ru: async () => (await import('./ru.json')).default as LocaleMessages,
  jp: async () => (await import('./jp.json')).default as LocaleMessages,
  dv: async () => (await import('./dv.json')).default as LocaleMessages,
  uk: async () => (await import('./uk.json')).default as LocaleMessages,
  ur: async () => (await import('./ur.json')).default as LocaleMessages,
  he: async () => (await import('./he.json')).default as LocaleMessages,
  ar: async () => (await import('./ar.json')).default as LocaleMessages,
  dz: async () => (await import('./dz.json')).default as LocaleMessages,
  ne: async () => (await import('./ne.json')).default as LocaleMessages,
  my: async () => (await import('./my.json')).default as LocaleMessages,
  'zh-TW': async () => (await import('./zh-TW.json')).default as LocaleMessages,
  kh: async () => (await import('./kh.json')).default as LocaleMessages,
  ko: async () => (await import('./ko.json')).default as LocaleMessages,
  th: async () => (await import('./th.json')).default as LocaleMessages,
  am: async () => (await import('./am.json')).default as LocaleMessages,
  az: async () => (await import('./az.json')).default as LocaleMessages,
  hy: async () => (await import('./hy.json')).default as LocaleMessages,
  ka: async () => (await import('./ka.json')).default as LocaleMessages,
  tr: async () => (await import('./tr.json')).default as LocaleMessages,
  si: async () => (await import('./si.json')).default as LocaleMessages,
  ta: async () => (await import('./ta.json')).default as LocaleMessages,
  id: async () => (await import('./id.json')).default as LocaleMessages,
};

async function loadLocaleMessages(locale: SupportedLocale): Promise<LocaleMessages> {
  if (locale === 'en') return en;
  return await jsonLocaleLoaders[locale]();
}

const loadedLocales = new Set<SupportedLocale>(['en']);

const messages = sanitizeLocaleValue({ en }) as any;

export const i18n = createI18n({
  locale: 'en',
  fallbackLocale: false,
  messages,
  globalInjection: true,
  legacy: false,
});

export async function ensureLocaleLoaded(locale: string): Promise<SupportedLocale> {
  const normalized: SupportedLocale = isSupportedLocale(locale) ? locale : 'en';
  if (loadedLocales.has(normalized)) return normalized;

  const messages = await loadLocaleMessages(normalized);
  i18n.global.setLocaleMessage(normalized, sanitizeLocaleValue(messages) as any);
  loadedLocales.add(normalized);
  return normalized;
}
