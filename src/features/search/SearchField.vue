<template>
  <div
    class="search-field"
    :data-size="size"
  >
    <form
      role="search"
      :aria-label="$t('ux.searchLabel')"
      @submit.prevent="submit"
    >
      <SearchIcon
        class="search-field__icon"
        aria-hidden="true"
        focusable="false"
      />
      <input
        :id="inputId"
        v-model="request"
        type="search"
        :aria-label="$t('ux.searchLabel')"
        :placeholder="placeholder ?? $t('ux.searchPlaceholder')"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${inputId}-error` : undefined"
        @input="error = ''"
      >
      <button
        v-if="request"
        type="button"
        class="icon-button"
        :aria-label="$t('ux.clearSearch')"
        @click="clear"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        ><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>
      <button
        type="submit"
        class="search-field__submit"
      >
        {{ $t('search') }}
      </button>
      <details class="search-field__help">
        <summary :aria-label="$t('ux.searchHelp')">
          ?
        </summary>
        <div><strong>{{ $t('ux.searchHelp') }}</strong><p>{{ $t('ux.searchSyntax') }}</p></div>
      </details>
    </form>
    <p
      v-if="error"
      :id="`${inputId}-error`"
      class="search-field__error"
      role="alert"
    >
      {{ $t(error) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import SearchIcon from '@soramitsu-ui/icons/icomoon/basic-search-24.svg';
import { ref, useId } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { useScopedExplorerNavigation } from '@/shared/ui/composables/useExplorerScopeNavigation';
import { classifySearchQuery } from './classifier';

defineProps<{ size?: 'sm' | 'md' | 'lg', placeholder?: string }>();
const emit = defineEmits<{ submit: [value: string] }>();
const navigation = useScopedExplorerNavigation();
const inputId = useId();
const request = ref('');
const error = ref('');

function clear() {
  request.value = '';
  error.value = '';
  document.getElementById(inputId)?.focus();
}

async function submit() {
  const value = request.value.trim();
  emit('submit', value);
  const result = classifySearchQuery(value);
  if (result.kind === 'unsupported') {
    error.value = 'ux.searchInvalid';
    return;
  }
  let to: RouteLocationRaw;
  switch (result.kind) {
    case 'hash': to = { name: 'search-results', query: { q: result.value } }; break;
    case 'block-height': to = { name: 'blocks-details', params: { heightOrHash: result.value } }; break;
    case 'account': to = { name: 'account-details', params: { id: result.value } }; break;
    case 'asset-definition': to = { name: 'asset-details', params: { id: result.value } }; break;
    case 'nft': to = { name: 'nft-details', params: { id: result.value } }; break;
    case 'rwa': to = { name: 'rwa-details', params: { id: result.value } }; break;
    case 'domain': to = { name: 'domain-details', params: { id: result.value } }; break;
  }
  error.value = '';
  try {
    const failure = await navigation.push(to);
    if (request.value.trim() !== value) return;
    if (failure) error.value = 'ux.searchFailed';
    else request.value = '';
  } catch {
    if (request.value.trim() === value) error.value = 'ux.searchFailed';
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;
.search-field {
  position: relative; min-width: 0; width: 100%;
  form { display: flex; align-items: center; height: 44px; border: 1px solid theme-color('border-secondary'); border-radius: 8px; background: theme-color('surface'); }
  form:focus-within { outline: 2px solid theme-color('primary'); outline-offset: 2px; }
  &__icon { width: 20px; height: 20px; flex: 0 0 20px; margin-inline-start: 12px; color: theme-color('content-secondary'); fill: currentColor; }
  input { min-width: 0; flex: 1; width: 100%; height: 42px; padding: 0 10px; background: transparent; border: 0; outline: none; color: theme-color('content-primary'); font: inherit; font-size: 14px;
    &::placeholder { color: theme-color('content-secondary'); opacity: 1; }
    &::-webkit-search-cancel-button { display: none; }
  }
  &__submit { flex-shrink: 0; min-width: 44px; min-height: 44px; padding: 0 10px; border: 0; background: transparent; color: theme-color('primary'); cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; }
  &__help {
    summary { list-style: none; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; color: theme-color('content-secondary'); }
    summary::-webkit-details-marker { display: none; }
    > div { position: absolute; inset-inline: 0; top: calc(100% + 8px); z-index: 50; padding: 16px; background: theme-color('surface'); border: 1px solid theme-color('border-secondary'); border-radius: 12px; font-size: 13px; line-height: 1.6; }
    p { margin-top: 8px; }
  }
  &__error { position: absolute; inset-inline: 0; top: calc(100% + 8px); z-index: 51; padding: 12px; border: 1px solid theme-color('error'); border-radius: 8px; background: theme-color('surface'); color: theme-color('content-primary'); font-size: 13px; }
  .icon-button { flex: 0 0 44px; }
}
</style>
