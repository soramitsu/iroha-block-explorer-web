<template>
  <div
    class="transaction-status"
    :class="{ 'transaction-status--tooltip': type === 'tooltip' }"
  >
    <button
      v-if="type === 'tooltip'"
      type="button"
      class="transaction-status__trigger"
      :aria-label="$t(messageKey)"
      :aria-describedby="tooltipId"
      :aria-expanded="visible"
      @mouseenter="hovered = true; dismissed = false"
      @mouseleave="hovered = false"
      @focus="focused = true; dismissed = false"
      @blur="focused = false; pinned = false"
      @click.stop="pinned = !pinned; dismissed = !pinned"
      @keydown.esc.stop.prevent="pinned = false; dismissed = true"
    >
      <span
        class="transaction-status__icon"
        :data-committed="committed"
        aria-hidden="true"
      >
        <SuccessIcon v-if="committed" />
        <ErrorIcon v-else />
      </span>
    </button>

    <template v-else>
      <span
        class="transaction-status__icon"
        :data-committed="committed"
        aria-hidden="true"
      >
        <SuccessIcon v-if="committed" />
        <ErrorIcon v-else />
      </span>
      <span
        class="transaction-status__label"
        :data-committed="committed"
      >
        {{ $t(committed ? 'transactions.committed' : 'transactions.rejected') }}
      </span>
    </template>

    <span
      v-if="type === 'tooltip'"
      v-show="visible"
      :id="tooltipId"
      class="transaction-status__tooltip"
      role="tooltip"
    >
      {{ $t(messageKey) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import SuccessIcon from '@/shared/ui/icons/success.svg';
import ErrorIcon from '@/shared/ui/icons/error.svg';

interface Props {
  committed: boolean
  type: 'label' | 'tooltip'
}

const props = defineProps<Props>();
const tooltipId = useId();
const hovered = ref(false);
const focused = ref(false);
const pinned = ref(false);
const dismissed = ref(false);
const visible = computed(() => !dismissed.value && (hovered.value || focused.value || pinned.value));
const messageKey = computed(() => props.committed
  ? 'transactions.committedTransaction'
  : 'transactions.rejectedTransaction');
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transaction-status {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  gap: size(1);
  align-items: center;
  height: size(4);

  &--tooltip {
    width: 44px;
    height: 44px;
  }

  &__trigger {
    display: grid;
    place-items: center;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;

    &:hover {
      background: theme-color('background-hover');
    }

    &:focus-visible {
      outline: 2px solid theme-color('primary');
      outline-offset: 2px;
    }
  }

  &__icon {
    flex: 0 0 size(4);
    width: size(4);
    height: size(4);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 14px;
      height: 14px;
    }

    &[data-committed='true'] {
      background: theme-color('success-background');
      color: theme-color('success');
    }

    &[data-committed='false'] {
      background: theme-color('error-background');
      color: theme-color('error');
    }
  }

  &__tooltip {
    position: absolute;
    z-index: 20;
    inset-inline-start: 0;
    bottom: calc(100% + 8px);
    width: max-content;
    max-width: min(240px, calc(100vw - 32px));
    padding: size(1) size(1.5);
    border: 1px solid theme-color('border-secondary');
    border-radius: size(1);
    background: theme-color('surface');
    color: theme-color('content-primary');
    white-space: normal;
    overflow-wrap: anywhere;
    @include tpg-s4;
  }

  &__label {
    @include tpg-h3;

    &[data-committed='true'] {
      color: theme-color('success');
    }

    &[data-committed='false'] {
      color: theme-color('error');
    }
  }
}
</style>
