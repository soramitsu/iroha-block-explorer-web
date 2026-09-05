import { computed, onScopeDispose, readonly, ref, watch } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildToriiUrl } from '@/shared/api';
import { Block as BlockSchema } from '@/shared/api/schemas';
import type { Block } from '@/shared/api/schemas';

interface UseBlockStreamOptions {
  reconnectDelayMs?: number;
}

export function useBlockStream(onBlock: (block: Block) => void, options?: UseBlockStreamOptions) {
  const reconnectDelay = options?.reconnectDelayMs ?? 3000;

  const isSupported = typeof window !== 'undefined' && typeof EventSource !== 'undefined';
  const fromHeight = ref<number | null>(null);
  const error = ref<Error | null>(null);

  const streamUrl = computed(() => {
    if (!isSupported) return undefined;
    if (fromHeight.value === null) return undefined;
    return buildToriiUrl('/v1/explorer/blocks/stream');
  });

  const { data, status, close, open } = useEventSource(streamUrl, [], {
    immediate: false,
    autoConnect: false,
    autoReconnect: { retries: -1, delay: reconnectDelay },
  });

  const isStreaming = computed(() => status.value === 'OPEN');

  watch(
    () => streamUrl.value,
    (url) => {
      if (!url) {
        close();
        return;
      }
      open();
    }
  );

  watch(
    () => data.value,
    (payload) => {
      if (payload === null) return;
      try {
        const block = BlockSchema.parse(JSON.parse(payload));
        error.value = null;
        const min = fromHeight.value;
        if (min !== null && block.height < min) return;
        onBlock(block);
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error('Invalid block stream payload', { cause });
      }
    }
  );

  function connectFrom(height: number) {
    error.value = null;
    fromHeight.value = height;
  }

  function disconnect() {
    fromHeight.value = null;
    close();
  }

  onScopeDispose(disconnect);

  return {
    isSupported,
    isStreaming,
    error: readonly(error),
    connectFrom,
    disconnect,
  };
}
