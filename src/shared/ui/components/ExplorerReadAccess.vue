<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getToriiBaseUrl } from '@/shared/api';
import {
  createConnectAppSession, createConnectCanonicalRequestAuth, createConnectSessionPreview,
  getConnectConfiguration, registerConnectSession, TORII_CANONICAL_REQUEST_DOMAIN_TAG,
  type ConnectAppSession,
} from '@/shared/lib/connect';
import {
  activateExplorerReadSession, disconnectExplorerReadSession, explorerReadAccountId, explorerReadFailure,
} from '@/shared/lib/explorer-read-auth';
import BaseButton from './BaseButton.vue';

const { t } = useI18n();
const open = ref(false);
const pending = ref(false);
const error = ref<string | null>(null);
const walletUri = ref<string | null>(null);
const qrCode = ref<string | null>(null);
const configuration = computed(() => getConnectConfiguration());
let appSession: ConnectAppSession | null = null;
let generation = 0;

function closeAttempt() {
  generation += 1;
  appSession?.close('Explorer read session ended');
  appSession = null;
  pending.value = false;
  walletUri.value = null;
  qrCode.value = null;
}

function disconnect() {
  disconnectExplorerReadSession();
  closeAttempt();
  error.value = null;
}

async function connect() {
  const config = configuration.value;
  if (!config.available || pending.value) return;
  disconnect();
  const attempt = generation;
  const baseUrl = getToriiBaseUrl();
  pending.value = true;
  error.value = null;
  try {
    const preview = createConnectSessionPreview({ networkId: config.networkId, node: baseUrl });
    const registered = await registerConnectSession(baseUrl, preview, { node: baseUrl });
    if (attempt !== generation) return;
    walletUri.value = registered.wallet_uri;
    const { default: QRCode } = await import('qrcode');
    if (attempt !== generation) return;
    const generatedQr = await QRCode.toDataURL(registered.wallet_uri, { width: 224, margin: 2 });
    if (attempt !== generation) return;
    qrCode.value = generatedQr;
    const connected = createConnectAppSession({
      baseUrl, preview, session: registered,
      permissions: { methods: ['sign_raw'], resources: [TORII_CANONICAL_REQUEST_DOMAIN_TAG] },
      appMeta: { name: 'Iroha Explorer · read access', url: window.location.origin },
    });
    appSession = connected;
    let revokeActiveSession: ((reason?: string) => void) | undefined;
    const socketEnded = () => {
      const reason = t('accounts.multisigWorkspace.sessionClosed');
      revokeActiveSession?.(reason);
      if (attempt === generation) {
        error.value = reason;
        closeAttempt();
      }
    };
    connected.socket.addEventListener('close', socketEnded, { once: true });
    connected.socket.addEventListener('error', socketEnded, { once: true });
    const auth = await createConnectCanonicalRequestAuth(connected);
    if (attempt !== generation || getToriiBaseUrl() !== baseUrl) return;
    revokeActiveSession = activateExplorerReadSession({ baseUrl, networkId: config.literal, auth, close: () => {
      if (appSession === connected) appSession = null;
      connected.close('Explorer read session ended');
    } });
    walletUri.value = null;
    qrCode.value = null;
  } catch (cause) {
    if (attempt !== generation) return;
    disconnect();
    error.value = cause instanceof Error ? cause.message : t('accounts.multisigWorkspace.sessionError');
  } finally {
    if (attempt === generation) pending.value = false;
  }
}

watch(() => getToriiBaseUrl(), disconnect);
onBeforeUnmount(() => {
  if (pending.value) closeAttempt();
  else {
    // The application owns an approved session across route/header changes.
    // Its exact-session revoker still handles wallet socket closure.
    generation += 1;
    appSession = null;
  }
});
</script>

<template>
  <div class="explorer-read-access">
    <BaseButton
      bordered
      data-test="read-access-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ explorerReadFailure ? $t('telemetry.disconnected') : explorerReadAccountId ? $t('telemetry.connected') : $t('readAccess.title') }}
    </BaseButton>
    <section
      v-if="open"
      class="explorer-read-access__panel"
      :aria-label="$t('readAccess.title')"
    >
      <strong>{{ $t('readAccess.title') }}</strong>
      <p>{{ $t('readAccess.description') }}</p>
      <template v-if="explorerReadFailure">
        <p role="alert" data-test="read-access-failure">{{ explorerReadFailure }}</p>
        <BaseButton bordered data-test="read-access-public" @click="disconnect">{{ $t('readAccess.public') }}</BaseButton>
      </template>
      <template v-if="explorerReadAccountId">
        <p>{{ $t('accounts.multisigWorkspace.authenticatedReader') }}</p>
        <code data-test="read-access-account">{{ explorerReadAccountId }}</code>
        <BaseButton
          bordered
          data-test="read-access-disconnect"
          @click="disconnect"
        >
          {{ $t('readAccess.disconnect') }}
        </BaseButton>
      </template>
      <template v-else-if="configuration.available">
        <BaseButton
          bordered
          data-test="read-access-connect"
          :disabled="pending"
          @click="connect"
        >
          {{ pending ? $t('accounts.multisigWorkspace.waiting') : explorerReadFailure ? $t('accounts.multisigWorkspace.retryAuthentication') : $t('accounts.multisigWorkspace.createSession') }}
        </BaseButton>
        <template v-if="walletUri">
          <img
            v-if="qrCode"
            :src="qrCode"
            width="224"
            height="224"
            :alt="$t('accounts.multisigWorkspace.openWallet')"
          >
          <a
            :href="walletUri"
            data-test="read-access-wallet"
          >{{ $t('accounts.multisigWorkspace.openWallet') }}</a>
          <p>{{ $t('accounts.multisigWorkspace.waiting') }}</p>
        </template>
        <BaseButton
          v-if="pending"
          bordered
          data-test="read-access-cancel"
          @click="disconnect"
        >
          {{ $t('ux.close') }}
        </BaseButton>
      </template>
      <p
        v-else
        role="status"
      >
        {{ configuration.error.message }}
      </p>
      <p
        v-if="error && !explorerReadFailure"
        role="alert"
      >
        {{ error }}
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;
.explorer-read-access {
  position: relative;
  &__panel {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 12px);
    z-index: 110;
    display: grid;
    gap: 12px;
    width: min(340px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid theme-color('border-primary');
    border-radius: 16px;
    background: theme-color('surface');
    color: theme-color('content-primary');
    box-shadow: theme-shadow('separator');
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    img { max-width: 100%; height: auto; }
  }
}
</style>
