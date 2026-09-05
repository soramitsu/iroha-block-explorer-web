<script setup lang="ts" generic="T">
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

const props = defineProps<{
  snapshot: ResourceSnapshot<T>
  loadingLabel?: string
  notFoundLabel?: string
  errorLabel?: string
  retryLabel?: string
}>();

const emit = defineEmits<{
  retry: []
}>();
</script>

<template>
  <div
    v-if="props.snapshot.status === 'idle' || props.snapshot.status === 'initial-loading'"
    class="base-resource-state base-resource-state--loading"
    role="status"
    aria-live="polite"
  >
    <BaseLoading />
    <span class="base-resource-state__label">
      {{ props.loadingLabel ?? $t('dataspaces.loading') }}
    </span>
  </div>

  <div
    v-else-if="props.snapshot.status === 'not-found'"
    class="base-resource-state base-resource-state--message row-text"
    role="status"
  >
    <slot name="not-found">
      {{ props.notFoundLabel ?? $t('noData') }}
    </slot>
  </div>

  <div
    v-else-if="props.snapshot.status === 'error'"
    class="base-resource-state base-resource-state--message row-text"
    role="alert"
  >
    <slot
      name="error"
      :problem="props.snapshot.problem"
    >
      <span>{{ props.errorLabel ?? $t('transactions.unknownError') }}</span>
    </slot>
    <BaseButton
      bordered
      data-test="resource-retry"
      @click="emit('retry')"
    >
      {{ props.retryLabel ?? $t('transactions.retryInstruction') }}
    </BaseButton>
  </div>

  <div
    v-else
    class="base-resource-state base-resource-state--ready"
    :aria-busy="props.snapshot.isRefreshing"
  >
    <div
      v-if="props.snapshot.isRefreshing"
      class="base-resource-state__refresh"
      role="status"
      aria-live="polite"
    >
      <BaseLoading />
      <span class="base-resource-state__visually-hidden">
        {{ props.loadingLabel ?? $t('dataspaces.loading') }}
      </span>
    </div>
    <div
      v-if="props.snapshot.refreshError"
      class="base-resource-state__refresh-error row-text"
      role="alert"
    >
      <slot
        name="refresh-error"
        :problem="props.snapshot.refreshError"
      >
        {{ props.errorLabel ?? $t('transactions.unknownError') }}
      </slot>
      <BaseButton
        bordered
        data-test="resource-refresh-retry"
        @click="emit('retry')"
      >
        {{ props.retryLabel ?? $t('transactions.retryInstruction') }}
      </BaseButton>
    </div>
    <slot :data="props.snapshot.data" />
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-resource-state {
  position: relative;

  &--loading,
  &--message {
    min-height: size(18);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: size(2);
    padding: size(4);
  }

  &--loading {
    flex-direction: column;
  }

  &__label,
  &__refresh-error {
    color: theme-color('content-tertiary');
  }

  &__refresh {
    position: absolute;
    inset-block-start: size(1);
    inset-inline-end: size(2);
    z-index: 1;

    .base-loading {
      width: size(3);
      height: size(3);
    }
  }

  &__refresh-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: size(2);
    padding: size(2) size(4);
    border-bottom: 1px solid theme-color('border-primary');
  }

  &__visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
