<template>
  <div class="base-hash">
    <BaseLink
      v-if="displayLink"
      :to="displayLink"
      monospace
    >
      <span v-if="content.t === 'two-line'">{{ content.first }}<br>{{ content.second }}</span>
      <span v-else>{{ content.value }}</span>
    </BaseLink>

    <span v-else-if="content.t === 'two-line'">{{ content.first }}<br>{{ content.second }}</span>
    <span v-else>{{ content.value }}</span>

    <CopyIcon
      v-if="props.copy"
      role="button"
      tabindex="0"
      class="base-hash__copy"
      @click.stop="copyHash"
      @keydown.enter.space.stop="copyHash"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CopyIcon from '@/shared/ui/icons/copy.svg';
import { useClipboard } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useNotifications } from '@/shared/ui/composables/notifications';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import type { HashType } from '@/shared/ui/composables/useAdaptiveHash';
import { getToriiBaseUrl } from '@/shared/api';
import { getDisplayedAccountId, normalizeAccountRoutePath } from '@/shared/lib/account-id';

interface Props {
  hash: string
  link?: string
  copy?: boolean
  type: HashType
}

const props = defineProps<Props>();
const clipboard = useClipboard();
const notifications = useNotifications();
const { t } = useI18n({ useScope: 'global' });
const displayHash = computed(() => getDisplayedAccountId(props.hash, getToriiBaseUrl()));
const displayLink = computed(() => (props.link ? normalizeAccountRoutePath(props.link, getToriiBaseUrl()) : undefined));

async function copyHash() {
  if (clipboard.isSupported) {
    await clipboard.copy(displayHash.value);
    notifications.success(t('clipboard.success'));
  } else {
    notifications.error(t('clipboard.error'));
  }
}

type Content = { t: 'plain', value: string } | { t: 'two-line', first: string, second: string };

function shortenHash(str: string, n: number) {
  const [authority, domain] = str.split('@');

  const shortenAuthority = authority.slice(0, n) + '...' + authority.slice(-n);

  if (!domain) return shortenAuthority;

  return shortenAuthority + '@' + domain;
}

function splitTwoLineHash(value: string): { first: string, second: string } {
  const [authority, domain] = value.split('@');
  if (domain) {
    return {
      first: authority,
      second: `@${domain}`,
    };
  }

  const ellipsisIndex = value.indexOf('...');
  if (ellipsisIndex > 0 && ellipsisIndex + 3 < value.length) {
    return {
      first: value.slice(0, ellipsisIndex + 3),
      second: value.slice(ellipsisIndex + 3),
    };
  }

  const midpoint = Math.ceil(value.length / 2);
  return {
    first: value.slice(0, midpoint),
    second: value.slice(midpoint),
  };
}

const content = computed<Content>(() => {
  const hash = displayHash.value;
  switch (props.type) {
    case 'full': {
      return {
        t: 'plain',
        value: hash,
      };
    }
    case 'short': {
      return {
        t: 'plain',
        value: shortenHash(hash, 4),
      };
    }
    case 'medium': {
      return {
        t: 'plain',
        value: shortenHash(hash, 10),
      };
    }
    case 'two-line': {
      const shortened = shortenHash(hash, 4);
      const { first, second } = splitTwoLineHash(shortened);
      if (!second) {
        return {
          t: 'plain',
          value: shortened,
        };
      }

      return {
        t: 'two-line',
        first,
        second,
      };
    }
    default: {
      const x: never = props.type;
      throw new Error(`Unexpected props.type: ${String(x)}`);
    }
  }
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-hash {
  display: flex;
  align-items: center;
  word-break: break-all;

  &__copy {
    margin-left: size(1);
    cursor: pointer;
    color: theme-color('content-quaternary');

    &:hover {
      color: theme-color('content-tertiary');
    }
  }
}
</style>
