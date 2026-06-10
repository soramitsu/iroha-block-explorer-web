import { computed, onScopeDispose, ref, watch } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildExplorerUrl } from '@/shared/api';

interface UseBlockStreamOptions {
  reconnectDelayMs?: number
}

export function useBlockStream(
  onBlock: () => void,
  options?: UseBlockStreamOptions
) {
  const reconnectDelay = options?.reconnectDelayMs ?? 3000;

  const isSupported =
    typeof window !== 'undefined' &&
    typeof EventSource !== 'undefined';
  const fromHeight = ref<number | null>(null);

  const streamUrl = computed(() => {
    if (!isSupported) return undefined;
    if (fromHeight.value === null) return undefined;
    return buildExplorerUrl('/blocks/stream');
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
      if (!payload) return;
      const min = fromHeight.value;
      if (min) {
        try {
          const parsed = JSON.parse(payload);
          const heightValue = typeof parsed?.height === 'number' ? parsed.height : null;
          if (heightValue !== null && heightValue < min) return;
        } catch {
          // If payload is not JSON, treat it as a signal and refresh.
        }
      }
      onBlock();
    }
  );

  function connectFrom(height: number) {
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
    connectFrom,
    disconnect,
  };
}
