<template>
  <BaseContentBlock :title="$t('soracloud.serviceInspector')">
    <BaseInnerBlock
      :title="$t('soracloud.serviceConfigStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-service-config"
        @submit.prevent="submitServiceConfig"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="serviceConfigDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
              data-test="soracloud-service-config-service"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.configName') }}</span>
            <input
              v-model="serviceConfigDraft.config_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!serviceConfigDraftReady"
          data-test="soracloud-submit-service-config"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!serviceConfigRequest.activeQuery"
        class="soracloud-page__empty"
        data-test="soracloud-query-idle-service-config"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="serviceConfigRequest.isLoading && !serviceConfigRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="serviceConfigRequest.data">
        <p
          v-if="serviceConfigRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ serviceConfigRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.service')"
            :value="serviceConfigRequest.data.service_name"
          />
          <DataField
            :title="$t('soracloud.currentVersion')"
            :value="serviceConfigRequest.data.current_version"
            monospace
          />
          <DataField
            :title="$t('soracloud.configGeneration')"
            :value="formatNumber(serviceConfigRequest.data.config_generation)"
          />
          <DataField
            :title="$t('soracloud.configEntryCount')"
            :value="formatNumber(serviceConfigRequest.data.config_entry_count)"
          />
        </div>

        <div
          v-if="serviceConfigRequest.data.configs.length"
          class="soracloud-page__entry-list"
        >
          <article
            v-for="config in serviceConfigRequest.data.configs"
            :key="config.config_name"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title">
                {{ config.config_name }}
              </h4>
              <span class="row-text">#{{ formatNumber(config.last_update_sequence) }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.valueHash')"
                :value="config.value_hash"
                :hash="config.value_hash"
                monospace
              />
              <DataField
                :title="$t('soracloud.lastUpdateSequence')"
                :value="formatNumber(config.last_update_sequence)"
              />
            </div>

            <div class="soracloud-page__json-card">
              <span class="label">{{ $t('soracloud.valueJson') }}</span>
              <BaseJson
                :value="{ value: config.value_json }"
                full
              />
            </div>
          </article>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="serviceConfigRequest.error"
        class="soracloud-page__section-error"
      >
        {{ serviceConfigRequest.error }}
      </p>
    </BaseInnerBlock>

    <BaseInnerBlock
      :title="$t('soracloud.serviceSecretStatus')"
      accordion
    >
      <form
        class="soracloud-page__inspector-form"
        data-test="soracloud-form-service-secret"
        @submit.prevent="submitServiceSecret"
      >
        <div class="soracloud-page__form-grid">
          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.serviceName') }}</span>
            <input
              v-model="serviceSecretDraft.service_name"
              class="soracloud-page__input"
              :list="serviceSuggestions.length ? 'soracloud-service-suggestions' : undefined"
              :placeholder="$t('soracloud.serviceNamePlaceholder')"
              data-test="soracloud-service-secret-service"
            >
          </label>

          <label class="soracloud-page__field">
            <span>{{ $t('soracloud.secretName') }}</span>
            <input
              v-model="serviceSecretDraft.secret_name"
              class="soracloud-page__input"
              :placeholder="$t('soracloud.optionalPlaceholder')"
            >
          </label>
        </div>

        <button
          type="submit"
          class="soracloud-page__submit"
          :disabled="!serviceSecretDraftReady"
        >
          {{ $t('soracloud.inspect') }}
        </button>
      </form>

      <p
        v-if="!serviceSecretRequest.activeQuery"
        class="soracloud-page__empty"
      >
        {{ $t('soracloud.queryIdle') }}
      </p>

      <div
        v-else-if="serviceSecretRequest.isLoading && !serviceSecretRequest.data"
        class="soracloud-page__section-state"
      >
        <BaseLoading />
      </div>

      <template v-else-if="serviceSecretRequest.data">
        <p
          v-if="serviceSecretRequest.error"
          class="soracloud-page__inline-error"
        >
          {{ serviceSecretRequest.error }}
        </p>

        <div class="soracloud-page__detail-grid">
          <DataField
            :title="$t('soracloud.service')"
            :value="serviceSecretRequest.data.service_name"
          />
          <DataField
            :title="$t('soracloud.currentVersion')"
            :value="serviceSecretRequest.data.current_version"
            monospace
          />
          <DataField
            :title="$t('soracloud.secretGeneration')"
            :value="formatNumber(serviceSecretRequest.data.secret_generation)"
          />
          <DataField
            :title="$t('soracloud.secretEntryCount')"
            :value="formatNumber(serviceSecretRequest.data.secret_entry_count)"
          />
        </div>

        <div
          v-if="serviceSecretRequest.data.secrets.length"
          class="soracloud-page__entry-list"
        >
          <article
            v-for="secret in serviceSecretRequest.data.secrets"
            :key="secret.secret_name"
            class="soracloud-page__entry-card"
          >
            <div class="soracloud-page__entry-head">
              <h4 class="soracloud-page__entry-title">
                {{ secret.secret_name }}
              </h4>
              <span class="row-text">#{{ formatNumber(secret.last_update_sequence) }}</span>
            </div>

            <div class="soracloud-page__detail-grid">
              <DataField
                :title="$t('soracloud.encryption')"
                :value="jsonString(secret.encryption)"
              />
              <DataField
                :title="$t('soracloud.keyId')"
                :value="secret.key_id"
                monospace
              />
              <DataField
                :title="$t('soracloud.keyVersion')"
                :value="formatNumber(secret.key_version)"
              />
              <DataField
                :title="$t('soracloud.commitment')"
                :value="secret.commitment"
                :hash="secret.commitment"
                monospace
              />
              <DataField
                :title="$t('soracloud.ciphertextBytes')"
                :value="formatBytes(secret.ciphertext_bytes)"
              />
              <DataField
                :title="$t('soracloud.lastUpdateSequence')"
                :value="formatNumber(secret.last_update_sequence)"
              />
            </div>
          </article>
        </div>

        <p
          v-else
          class="soracloud-page__empty"
        >
          {{ $t('soracloud.noEntries') }}
        </p>
      </template>

      <p
        v-else-if="serviceSecretRequest.error"
        class="soracloud-page__section-error"
      >
        {{ serviceSecretRequest.error }}
      </p>
    </BaseInnerBlock>
  </BaseContentBlock>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type {
  SoracloudServiceConfigStatusQuery,
  SoracloudServiceConfigStatusResponse,
  SoracloudServiceSecretStatusQuery,
  SoracloudServiceSecretStatusResponse,
} from '@/shared/api/schemas';
import { formatBytes, formatNumber } from '@/shared/ui/utils/formatters';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseInnerBlock from '@/shared/ui/components/BaseInnerBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { jsonString } from './display';
import type { SoracloudSectionState } from './types';

const serviceConfigDraft = defineModel<{ service_name: string, config_name: string }>('serviceConfigDraft', { required: true });
const serviceSecretDraft = defineModel<{ service_name: string, secret_name: string }>('serviceSecretDraft', { required: true });

defineProps<{
  serviceSuggestions: string[]
  serviceConfigDraftReady: boolean
  serviceSecretDraftReady: boolean
  serviceConfigRequest: SoracloudSectionState<SoracloudServiceConfigStatusQuery, SoracloudServiceConfigStatusResponse>
  serviceSecretRequest: SoracloudSectionState<SoracloudServiceSecretStatusQuery, SoracloudServiceSecretStatusResponse>
  submitServiceConfig: () => void
  submitServiceSecret: () => void
}>();

useI18n();
</script>
