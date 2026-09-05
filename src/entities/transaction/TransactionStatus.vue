<template>
  <div class="transaction-status">
    <div
      class="transaction-status__icon"
      :data-committed="committed"
    >
      <SuccessIcon v-if="committed" />
      <ErrorIcon v-else />
    </div>

    <div
      v-if="type === 'label'"
      class="transaction-status__label"
      :data-committed="committed"
    >
      <span v-if="committed">{{ $t('transactions.committed') }}</span>
      <span v-else>{{ $t('transactions.rejected') }}</span>
    </div>

    <Tooltip
      v-if="type === 'tooltip'"
      :message="committed ? $t('transactions.committedTransaction') : $t('transactions.rejectedTransaction')"
    />
  </div>
</template>

<script setup lang="ts">
import SuccessIcon from '@/shared/ui/icons/success.svg';
import ErrorIcon from '@/shared/ui/icons/error.svg';
import Tooltip from '@/shared/ui/components/ContextTooltip.vue';

interface Props {
  committed: boolean
  type: 'label' | 'tooltip'
}

defineProps<Props>();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.transaction-status {
  position: relative;
  display: flex;
  grid-gap: size(1);
  align-items: center;
  height: size(4);

  &__icon {
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
