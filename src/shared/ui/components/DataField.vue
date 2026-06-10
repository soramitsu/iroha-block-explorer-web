<script setup lang="ts">
import BaseHash from '@/shared/ui/components/BaseHash.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import ContextTooltip from '@/shared/ui/components/ContextTooltip.vue';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';

const props = withDefaults(
  defineProps<{
    title: string
    value?: string | number | Record<string, any> | null
    hash?: string
    link?: string
    copy?: boolean
    type?: HashType
    metadata?: { display: 'short' | 'full' } | null
    tooltip?: string
    monospace?: boolean
  }>(),
  {
    value: null,
    hash: '',
    link: '',
    copy: false,
    type: 'full',
    metadata: null,
    tooltip: '',
    monospace: false,
  }
);
</script>

<template>
  <div class="data-field">
    <span class="data-field__title h-sm">{{ title }}</span>
    <div class="data-field__value">
      <slot v-if="$slots.default" />
      <BaseHash
        v-else-if="hash"
        :hash
        :link
        :copy
        :type
        :class="{ 'row-text': !props.link }"
      />
      <BaseLink
        v-else-if="value && link"
        :to="link"
        :monospace
      >
        {{ value }}
      </BaseLink>
      <BaseJson
        v-else-if="value && metadata"
        :full="metadata.display === 'full'"
        :value="value as Record<string, any>"
      />
      <span
        v-else
        class="data-field__value-text row-text"
        :class="{ 'row-text-monospace': props.monospace }"
      >{{
        props.value ?? $t('none')
      }}</span>
      <ContextTooltip
        v-if="tooltip"
        :message="tooltip"
      />
    </div>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.data-field {
  color: theme-color('content-primary');
  display: flex;
  justify-content: left;
  flex-direction: column;

  &__title {
    margin-bottom: size(1);
  }

  &__value {
    position: relative;

    &-text {
      word-break: break-all;
    }
  }

  &__value span:hover ~ .context-tooltip {
    display: flex;
  }
}
</style>
