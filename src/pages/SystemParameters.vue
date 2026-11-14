<script setup lang="ts">
import { computed } from 'vue';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import { setupAsyncData } from '@/shared/utils/setup-async-data';

defineOptions({ name: 'SystemParametersPage' });

const resource = setupAsyncData(() => http.fetchSystemParameters());
const parameters = computed(() => (resource.data?.status === SUCCESSFUL_FETCHING ? resource.data.data : null));
const customFieldName = 'custom';
const fixedSections = computed(() => {
  if (!parameters.value) return [];
  return [
    ['sumeragi', parameters.value.sumeragi],
    ['block', parameters.value.block],
    ['transaction', parameters.value.transaction],
    ['executor', parameters.value.executor],
    ['smart_contract', parameters.value.smart_contract],
  ] as const;
});
</script>

<template>
  <div class="system-parameters-page">
    <BaseContentBlock :title="$t('parameters.title')">
      <BaseResourceState
        :snapshot="resource.snapshot"
        :error-label="$t('parameters.loadError')"
        @retry="resource.refetch()"
      >
        <div v-if="parameters" class="system-parameters-page__content" data-test="system-parameters">
          <p class="row-text">
            {{ $t('parameters.description') }}
          </p>

          <section v-for="[name, value] in fixedSections" :key="name" class="system-parameters-page__section">
            <h3>
              <code>{{ name }}</code>
            </h3>
            <BaseJson :value full />
          </section>

          <section class="system-parameters-page__section">
            <h3><code>{{ customFieldName }}</code></h3>
            <BaseJson :value="parameters.custom ?? {}" full />
          </section>
        </div>
      </BaseResourceState>
    </BaseContentBlock>
  </div>
</template>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.system-parameters-page {
  &__content {
    display: grid;
    gap: size(2.5);
  }

  &__section {
    min-width: 0;
    padding-block-start: size(2);
    border-top: 1px solid theme-color('border-primary');

    h3 {
      margin-block: 0 size(1.5);
    }
  }
}
</style>
