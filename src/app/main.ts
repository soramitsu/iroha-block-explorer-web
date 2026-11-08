import '@/shared/ui/fonts/sora/index.css';
import '@/shared/ui/fonts/jet-brains-mono/index.css';

import { createApp } from 'vue';

import { loadRuntimeConfig } from '@/shared/runtime-config';

let bootstrapPending = false;
let mounted = false;

async function bootstrap() {
  if (bootstrapPending || mounted) return;
  bootstrapPending = true;
  try {
    const root = document.querySelector('#app');
    if (root) {
      const loading = document.createElement('p');
      loading.setAttribute('role', 'status');
      loading.setAttribute('data-testid', 'explorer-loading');
      loading.textContent = 'Loading Explorer…';
      root.replaceChildren(loading);
    }
    const config = await loadRuntimeConfig();
    // Do not evaluate API consumers (including their saved-node state) until the
    // runtime profile is valid. Apply its forced endpoint before loading the app.
    const { setToriiBaseUrlFromConfig } = await import('@/shared/api');
    if (config.toriiBaseUrl) {
      setToriiBaseUrlFromConfig(config.toriiBaseUrl, {
        force: config.toriiForceBaseUrl === true,
      });
    }

    const [{ default: App }, { default: router }, { ensureLocaleLoaded, i18n }] = await Promise.all([
      import('./App.vue'),
      import('./router'),
      import('@/shared/lib/localization'),
    ]);

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

    app.use(router);
    app.use(i18n);

    app.mount('#app');
    mounted = true;
  } finally {
    bootstrapPending = false;
  }
}

function showBootstrapError() {
  // Startup errors may contain private configuration or raw response bodies.
  // Keep both the visible error and the console message fixed and non-sensitive.
  console.error('[bootstrap] Explorer initialization failed. Check deployment configuration and connectivity.');
  const root = document.querySelector('#app');
  if (!root) return;

  const panel = document.createElement('section');
  panel.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.textContent = 'Explorer could not start';
  const message = document.createElement('p');
  message.textContent = 'The deployment configuration or application could not be loaded. Retry, or contact the deployment operator.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    bootstrap().catch(showBootstrapError);
  });
  panel.append(heading, message, retry);
  root.replaceChildren(panel);
}

bootstrap().catch(showBootstrapError);
