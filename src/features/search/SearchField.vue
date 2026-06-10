<template>
  <label
    class="search-field"
    :data-size="size"
    :data-focused="isFocused || null"
  >
    <SearchIcon class="search-field__icon" />

    <input
      :id="inputId"
      v-model="request"
      type="search"
      :placeholder="props.placeholder"
      class="search-field__input"
      @keyup.enter="submit"
    >
  </label>
</template>

<script setup lang="ts">
import SearchIcon from '@soramitsu-ui/icons/icomoon/basic-search-24.svg';
import { ref, computed, useId } from 'vue';
import { useActiveElement } from '@vueuse/core';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { useI18n } from 'vue-i18n';
import { normalizeAccountSelectorLiteral } from '@/shared/lib/account-literal';
import { normalizeAssetDefinitionSelectorLiteral } from '@/shared/lib/asset-definition-literal';
import { normalizeRwaIdLiteral } from '@/shared/lib/rwa-id';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';

interface Props {
  size?: 'sm' | 'md' | 'lg'
  placeholder?: string
}

const props = defineProps<Props>();
const emit = defineEmits<(e: 'submit', value: string) => void>();

const navigation = useScopedExplorerNavigation();
const notifications = useNotifications();
const { t } = useI18n({ useScope: 'global' });

const request = ref('');

const inputId = useId();
const activeElement = useActiveElement();
const isFocused = computed(() => activeElement.value?.id === inputId);

function submit() {
  const value = request.value.trim();
  emit('submit', value);
  if (!value) return;
  if (resolveNavigation(value)) {
    request.value = '';
    return;
  }
  notifications.error(t('searchUnsupported'));
}

function resolveNavigation(value: string): boolean {
  if (/^\d+$/.test(value)) {
    navigateTo('blocks-details', { heightOrHash: value });
    return true;
  }

  if (/^0x[a-fA-F0-9]{6,}$/.test(value)) {
    navigateTo('transaction-details', { hash: value });
    return true;
  }

  const accountId = parseAccountId(value);
  if (accountId) {
    navigateTo('account-details', { id: accountId });
    return true;
  }

  const assetDefinitionId = parseAssetDefinitionId(value);
  if (assetDefinitionId) {
    navigateTo('asset-details', { id: assetDefinitionId });
    return true;
  }

  const rwaId = parseRwaId(value);
  if (rwaId) {
    navigateTo('rwa-details', { id: rwaId });
    return true;
  }

  const nftId = parseNftId(value);
  if (nftId) {
    navigateTo('nft-details', { id: nftId });
    return true;
  }

  return false;
}

function parseAccountId(value: string): string | null {
  return normalizeAccountSelectorLiteral(value);
}

function parseAssetDefinitionId(value: string): string | null {
  return normalizeAssetDefinitionSelectorLiteral(value);
}

function parseNftId(value: string): string | null {
  const trimmed = value.trim();
  const [name, domain] = trimmed.split('$');
  if (!name || !domain) return null;
  if (trimmed.indexOf('$') !== trimmed.lastIndexOf('$')) return null;
  return /\s|[@#$]/u.test(name) || /\s|[@#$]/u.test(domain) ? null : trimmed;
}

function parseRwaId(value: string): string | null {
  return normalizeRwaIdLiteral(value);
}

function navigateTo(name: string, params: Record<string, any>) {
  const result = navigation.push({ name, params });
  if (result && typeof result.catch === 'function') {
    result.catch(() => {});
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.search-field {
  display: flex;
  align-items: center;
  transition:
    color 300ms ease-in-out,
    box-shadow 300ms ease-in-out,
    border-color 300ms ease-in-out,
    background-color 300ms ease-in-out;

  input {
    color: theme-color('content-primary');
    background: transparent;
    border: none;
    width: 100%;

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: theme-color('content-primary');
    }

    &::-webkit-search-cancel-button {
      -webkit-appearance: none;
      height: 0;
      width: 0;
      opacity: 0;
      pointer-events: none;
    }
  }

  path {
    fill: theme-color('border-secondary');
  }

  &[data-size='lg'] {
    width: 100%;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, theme-color('background') 80%, transparent),
      color-mix(in srgb, theme-color('surface') 90%, transparent)
    );
    border: 1px solid theme-color('border-secondary');
    backdrop-filter: blur(8px);
    height: size(6);
    padding: 0 size(2);
    border-radius: size(3);

    @include xs {
      height: size(8);
      padding: 0 size(3.5);
      border-radius: size(4);
    }

    @include md {
      height: size(11);
      padding: 0 size(3.5);
      border-radius: size(5.5);
    }

    &:hover {
      box-shadow: 0 10px 30px color-mix(in srgb, theme-color('primary') 5%, transparent);
    }

    &[data-focused] {
      border-color: theme-color('primary');
      box-shadow:
        0 10px 30px color-mix(in srgb, theme-color('primary') 12%, transparent),
        0 0 0 4px color-mix(in srgb, theme-color('primary') 12%, transparent);
    }

    input {
      @include tpg-s5;

      @include xs {
        @include tpg-s3;
      }

      @include md {
        @include tpg-s2;
      }
    }

    svg {
      display: block;
      margin-inline-end: size(2);
      height: size(2);
      width: size(2);
      transform: translateY(1px);

      @include xs {
        height: size(4);
        width: size(4);
      }
    }
  }

  &[data-size='md'] {
    display: flex;
    height: size(6);
    padding: 0 size(2);
    border-radius: size(3);
    @include shadow-input;

    @include sm {
      width: 280px;
    }

    @include md {
      width: 300px;
    }

    @include lg {
      width: 230px;
    }

    @include xl {
      width: 330px;
    }

    @include xxl {
      width: 439px;
    }

    &:hover {
      @include shadow-input-active;
    }

    &[data-focused] {
      @include shadow-input-active;
    }

    input {
      @include tpg-s3;
    }

    svg {
      margin-inline-end: size(1);
    }
  }

  &[data-size='sm'] {
    display: flex;
    height: size(6);
    padding: 0 size(2);
    border-radius: size(3);
    @include shadow-input;
    width: 210px;

    &:hover {
      @include shadow-input-active;
    }

    &[data-focused] {
      @include shadow-input-active;
    }

    input {
      @include tpg-s3;
    }

    svg {
      margin-inline-end: size(1);
    }
  }
}

:root[dir='rtl'] .search-field {
  direction: rtl;

  svg {
    margin-inline-start: size(1);
    margin-inline-end: 0;
  }
}

html:not(.dark) .search-field {
  path {
    fill: theme-color('content-tertiary');
  }

  input::placeholder {
    color: theme-color('content-secondary');
  }

  &[data-size='lg'] {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 97%, white),
      color-mix(in srgb, theme-color('surface-variant') 93%, white)
    );
    border-color: color-mix(in srgb, theme-color('border-primary') 76%, white);
    box-shadow:
      theme-shadow('large-input-1'),
      theme-shadow('large-input-2'),
      inset 1px 1px 0 rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(10px) saturate(120%);

    &:hover {
      border-color: color-mix(in srgb, theme-color('primary') 18%, theme-color('border-primary'));
      box-shadow:
        20px 20px 42px rgba(181, 164, 143, 0.24),
        -14px -14px 28px rgba(255, 255, 255, 0.92),
        inset 1px 1px 0 rgba(255, 255, 255, 0.98);
    }

    &[data-focused] {
      border-color: color-mix(in srgb, theme-color('primary') 50%, theme-color('border-secondary'));
      box-shadow:
        theme-shadow('large-input-active-1'),
        theme-shadow('large-input-active-2'),
        inset 1px 1px 0 rgba(255, 255, 255, 0.98),
        0 0 0 3px color-mix(in srgb, theme-color('primary') 15%, transparent);
    }
  }

  &[data-size='md'],
  &[data-size='sm'] {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, theme-color('surface') 97%, white),
      color-mix(in srgb, theme-color('surface-variant') 92%, white)
    );
    border: 1px solid color-mix(in srgb, theme-color('border-primary') 78%, white);
    box-shadow:
      theme-shadow('input-1'),
      theme-shadow('input-2'),
      theme-shadow('input-3');

    &:hover {
      border-color: color-mix(in srgb, theme-color('primary') 16%, theme-color('border-primary'));
    }

    &[data-focused] {
      border-color: color-mix(in srgb, theme-color('primary') 42%, theme-color('border-secondary'));
      box-shadow:
        theme-shadow('input-active-1'),
        theme-shadow('input-active-2'),
        theme-shadow('input-active-3'),
        inset 1px 1px 0 rgba(255, 255, 255, 0.96),
        0 0 0 2px color-mix(in srgb, theme-color('primary') 10%, transparent);
    }
  }
}
</style>
