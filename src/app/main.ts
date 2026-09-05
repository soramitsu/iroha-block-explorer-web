import '@/shared/ui/fonts/sora/index.css';
import '@/shared/ui/fonts/jet-brains-mono/index.css';

import { createApp, watch } from 'vue';

import App from './App.vue';
import router from './router';
import { ensureLocaleLoaded, i18n } from '@/shared/lib/localization';
import { getRuntimeConfig, loadRuntimeConfig } from '@/shared/runtime-config';
import { setToriiBaseUrlFromConfig } from '@/shared/api';
import { applyLocalizedDocumentMetadata } from '@/shared/lib/localized-metadata';
import { loadAncientFontForLocale } from '@/shared/ui/fonts/ancient';

function syncLocalizedDocumentMetadata(): void {
  if (typeof document === 'undefined') return;
  applyLocalizedDocumentMetadata(document, {
    title: String(i18n.global.t('appMetadata.title')),
    description: String(i18n.global.t('appMetadata.description')),
    keywords: String(i18n.global.t('appMetadata.keywords')),
    imageAlt: String(i18n.global.t('appMetadata.imageAlt')),
  });
}

async function bootstrap() {
  await loadRuntimeConfig();
  const config = getRuntimeConfig();
  if (config.toriiBaseUrl) {
    setToriiBaseUrlFromConfig(config.toriiBaseUrl, {
      force: config.toriiForceBaseUrl === true,
    });
  }

  if (typeof window !== 'undefined') {
    try {
      const storedLanguage = window.localStorage.getItem('app-language')?.trim();
      if (storedLanguage) {
        const resolved = await ensureLocaleLoaded(storedLanguage);
        i18n.global.locale.value = resolved;
      }
    } catch {
      // ignore localStorage access failures (privacy mode, blocked storage)
    }
  }

  const app = createApp(App);

  await loadAncientFontForLocale(i18n.global.locale.value);
  watch(i18n.global.locale, async (locale) => {
    await loadAncientFontForLocale(locale).catch((error) => {
      console.error(`[localization] Failed to load the ${locale} font`, error);
    });
  });
  watch(i18n.global.locale, syncLocalizedDocumentMetadata, { immediate: true });

  app.use(router);
  app.use(i18n);

  app.mount('#app');
}

bootstrap().catch((error) => {
  console.error('[bootstrap] Failed to initialize application', error);
});
