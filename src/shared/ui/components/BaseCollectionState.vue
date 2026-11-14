<script setup lang="ts" generic="T">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getToriiBaseUrl } from '@/shared/api';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

const props = defineProps<{
  snapshot: ResourceSnapshot<T>
  count: number
  filtered?: boolean
  table?: boolean
}>();
const { t } = useI18n({ useScope: 'global' });
const resourceSnapshot = computed<ResourceSnapshot<T>>(() => props.snapshot.status === 'not-found'
  ? { status: 'error', problem: { kind: 'http', status: 404, message: t('ux.collection.error', { node: getToriiBaseUrl() }) } }
  : props.snapshot);
const emit = defineEmits<{ retry: [], reset: [] }>();
</script>

<template>
  <BaseResourceState
    :snapshot="resourceSnapshot"
    :loading-label="$t('ux.collection.loading')"
    :error-label="$t('ux.collection.error', { node: getToriiBaseUrl() })"
    :retry-label="$t('ux.collection.retry')"
    @retry="emit('retry')"
  >
    <template #refresh-error>
      {{ $t('ux.collection.stale', { node: getToriiBaseUrl() }) }}
    </template>
    <div
      v-if="count === 0 && !table"
      class="base-collection-state__empty"
      data-test="collection-empty"
      role="status"
    >
      <span>{{ $t(filtered ? 'ux.collection.filteredEmpty' : 'ux.collection.empty') }}</span>
      <BaseButton
        v-if="filtered"
        bordered
        data-test="collection-reset"
        @click="emit('reset')"
      >
        {{ $t('ux.collection.resetFilters') }}
      </BaseButton>
    </div>
    <slot
      v-else
      :empty-label="$t(filtered ? 'ux.collection.filteredEmpty' : 'ux.collection.empty')"
    />
  </BaseResourceState>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.base-collection-state__empty {
  min-height: 144px;
  padding: size(3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: size(2);
  color: theme-color('content-primary');
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
