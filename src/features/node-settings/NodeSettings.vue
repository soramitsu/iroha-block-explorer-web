<template>
  <div class="node-settings">
    <BaseButton
      variant="secondary"
      size="sm"
      class="node-settings__button"
      :pressed="dropdown.isOpen.value"
      @click="dropdown.toggle"
    >
      <span class="node-settings__label">{{ $t('settings.nodeSelector') }}</span>
    </BaseButton>

    <Teleport
      v-if="dropdown.isOpen.value"
      :to="`#${PORTAL_ID}`"
    >
      <div
        ref="dropdownTarget"
        class="node-settings__dropdown"
      >
        <span class="h-sm">{{ $t('settings.nodeLabel') }}</span>
        <input
          v-model="toriiUrl"
          class="node-settings__input"
          type="url"
          :placeholder="defaultUrl"
        >
        <span class="node-settings__hint">
          {{ $t('settings.explorerBase') }}: {{ explorerBase }}
        </span>
        <div
          class="node-settings__health"
          :class="`node-settings__health_${availability.state.value}`"
          data-test="node-settings-health"
        >
          <span>{{ $t(`settings.nodeHealth.${availability.state.value}`) }}</span>
          <span
            v-if="availability.failureCount.value > 0"
            class="node-settings__health-count"
          >
            {{ availability.failureCount.value }}
          </span>
        </div>
        <div
          v-if="availability.state.value !== 'healthy'"
          class="node-settings__health-actions"
        >
          <BaseButton
            size="xs"
            variant="secondary"
            @click="onRetryFailover"
          >
            {{ $t('settings.retryFailover') }}
          </BaseButton>
        </div>
        <div class="node-settings__actions">
          <BaseButton
            size="sm"
            variant="secondary"
            @click="onReset"
          >
            {{ $t('settings.reset') }}
          </BaseButton>
          <BaseButton
            size="sm"
            :disabled="!toriiUrl.trim()"
            @click="onApply"
          >
            {{ $t('settings.apply') }}
          </BaseButton>
        </div>
        <div class="node-settings__presets">
          <span class="h-sm">{{ $t('settings.presets') }}</span>
          <div class="node-settings__presets-list">
            <BaseButton
              v-for="preset in presets"
              :key="preset.label"
              size="xs"
              variant="secondary"
              @click="toriiUrl = preset.url"
            >
              {{ preset.label }}
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onClickOutside } from '@vueuse/core';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useNodeSettingsDropdown } from '@/shared/ui/composables/header-portal';
import {
  getToriiBaseUrl,
  getExplorerApiBase,
  getToriiNodePresets,
  setToriiBaseUrl,
  resetToriiBaseUrl,
  retryToriiFailover,
  useToriiAvailability,
} from '@/shared/api';
import { useNotifications } from '@/shared/ui/composables/notifications';

const dropdown = useNodeSettingsDropdown();
const notifications = useNotifications();
const { t } = useI18n();
const availability = useToriiAvailability();

const dropdownTarget = ref<HTMLElement | null>(null);

onClickOutside(dropdownTarget, () => {
  if (dropdown.isOpen.value) dropdown.toggle();
}, {
  ignore: ['.node-settings__button'],
});

const toriiUrl = ref(getToriiBaseUrl());
const defaultUrl = getToriiBaseUrl();

const presets = getToriiNodePresets();

const explorerBase = computed(() => getExplorerApiBase());

function onApply() {
  const updated = setToriiBaseUrl(toriiUrl.value);
  toriiUrl.value = updated;
  notifications.success(t('settings.nodeSaved'));
  dropdown.toggle();
}

function onReset() {
  const updated = resetToriiBaseUrl();
  toriiUrl.value = updated;
  notifications.success(t('settings.nodeReset'));
  dropdown.toggle();
}

async function onRetryFailover() {
  const switched = await retryToriiFailover();
  toriiUrl.value = getToriiBaseUrl();
  if (switched) notifications.success(t('settings.failoverSwitched'));
  else notifications.error(t('settings.failoverUnavailable'));
}
</script>

<style scoped lang="scss">
@use '@/shared/ui/styles/main' as *;

.node-settings {
  min-width: 0;
  width: auto;

  &__button {
    width: auto;
    max-width: 100%;
    min-width: 0;
    padding: size(1.25) size(1.5);
  }

  &__label {
    display: block;
    max-width: size(20);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__dropdown {
    width: size(60);
    background: theme-color('surface');
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    box-shadow: theme-shadow('row');
    padding: size(2);
    display: flex;
    flex-direction: column;
    gap: size(1.5);
  }

  &__input {
    width: 100%;
    padding: size(1.5);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('background');
    color: theme-color('content-primary');
    @include tpg-s3;

    &::placeholder {
      color: theme-color('content-tertiary');
    }

    &:focus {
      outline: none;
      border-color: theme-color('primary');
      box-shadow: 0 0 0 2px color-mix(in srgb, theme-color('primary') 15%, transparent);
    }
  }

  &__hint {
    color: theme-color('content-secondary');
    @include tpg-s4;
    word-break: break-all;
  }

  &__health {
    display: inline-flex;
    align-items: center;
    gap: size(1);
    width: fit-content;
    padding: size(0.5) size(1);
    border-radius: size(1);
    border: 1px solid theme-color('border-primary');
    background: theme-color('surface-variant');
    color: theme-color('content-secondary');
    @include tpg-s4;
  }

  &__health-count {
    min-width: size(3);
    text-align: center;
    border-radius: size(999);
    padding: 0 size(0.75);
    background: color-mix(in srgb, theme-color('error') 20%, transparent);
    color: theme-color('content-primary');
    @include tpg-s5;
  }

  &__health_healthy {
    border-color: color-mix(in srgb, theme-color('success') 40%, theme-color('border-primary'));
    color: color-mix(in srgb, theme-color('success') 80%, theme-color('content-primary'));
  }

  &__health_degraded {
    border-color: color-mix(in srgb, theme-color('warning') 40%, theme-color('border-primary'));
    color: color-mix(in srgb, theme-color('warning') 90%, theme-color('content-primary'));
  }

  &__health_failing_over,
  &__health_outage {
    border-color: color-mix(in srgb, theme-color('error') 45%, theme-color('border-primary'));
    color: color-mix(in srgb, theme-color('error') 90%, theme-color('content-primary'));
  }

  &__health-actions {
    display: flex;
    justify-content: flex-start;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: size(1);
  }

  &__presets {
    display: flex;
    flex-direction: column;
    gap: size(1);
  }

  &__presets-list {
    display: flex;
    gap: size(1);
    flex-wrap: wrap;
  }
}
</style>
