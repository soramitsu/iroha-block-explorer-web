<template>
  <div
    v-if="noti.list.value.length"
    class="app-notifications"
  >
    <div
      v-for="item in noti.list.value"
      :key="item.id"
      class="app-notifications__item"
      :role="item.type === 'error' ? 'alert' : 'status'"
      :aria-live="item.type === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      <component
        :is="icons[item.type] || 'div'"
        :class="`app-notifications__icon-${item.type}`"
        aria-hidden="true"
      />

      <span class="app-notifications__message">{{ item.message }}</span>

      <button
        type="button"
        class="app-notifications__close"
          :aria-label="$t('accessibility.dismissNotification')"
        @click="noti.close(item.id)"
      >
        <CloseIcon aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import SuccessIcon from '@soramitsu-ui/icons/icomoon/basic-circle-checked-24.svg';
import ErrorIcon from '@soramitsu-ui/icons/icomoon/notifications-x-octagon-24.svg';
import CloseIcon from '@soramitsu-ui/icons/icomoon/x-16.svg';
import { useNotifications } from '@/shared/ui/composables/notifications';

const noti = useNotifications();

const icons = {
  success: SuccessIcon,
  error: ErrorIcon,
};
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.app-notifications {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  padding: size(5);
  display: grid;
  grid-gap: size(3);
  justify-items: center;

  &__item {
    display: grid;
    grid-template-columns: size(3) auto size(3);
    grid-gap: size(2);
    width: fit-content;
    align-items: center;
    padding: size(2);
    border-radius: size(1);
    background: theme-color('background-inverted');
    color: theme-color('content-on-background-inverted');

    @include shadow-notification;
  }

  &__icon {
    &-success {
      fill: theme-color('success');
    }

    &-error {
      fill: theme-color('error');
    }
  }

  &__message {
    @include tpg-h3;
  }

  &__close {
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    fill: theme-color('content-on-background-inverted');
    cursor: pointer;
    width: size(3);
    height: size(3);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
