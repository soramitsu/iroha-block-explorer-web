import { useLocalStorage } from '@vueuse/core';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ensureLocaleLoaded } from '@/shared/lib/localization';

const RTL_LOCALES = ['ar', 'ur', 'he', 'dv'];

export const useApplicationLanguage = () => {
  const language = useLocalStorage('app-language', 'en');
  const { locale } = useI18n();

  async function setApplicationCurrency(value: string) {
    const resolved = await ensureLocaleLoaded(value);
    language.value = resolved;
  }

  function applyDirection(value: string) {
    if (typeof document === 'undefined') return;
    const isRtl = RTL_LOCALES.includes(value);
    const html = document.documentElement;
    html.lang = value || 'en';
    html.dir = isRtl ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', isRtl);
  }

  let syncToken = 0;
  watch(
    () => language.value,
    async (value) => {
      const token = ++syncToken;
      const resolved = await ensureLocaleLoaded(value);
      if (token !== syncToken) return;
      if (resolved !== value) {
        language.value = resolved;
      }
      locale.value = resolved;
      applyDirection(resolved);
    },
    { immediate: true }
  );

  return {
    language,
    setApplicationCurrency,
  };
};
