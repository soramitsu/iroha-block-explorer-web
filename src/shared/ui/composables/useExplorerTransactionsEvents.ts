import { computed, effectScope, getCurrentScope, onScopeDispose, ref } from 'vue';
import type { Ref } from 'vue';
import type { EffectScope } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildExplorerUrl, useToriiAddressFormatPreference } from '@/shared/api';

interface ExplorerTransactionsEventSource {
  data: Ref<string | null>
  status: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>
  close: () => void
}

let sharedEvents: ExplorerTransactionsEventSource | null = null;
let consumers = 0;
let sharedScope: EffectScope | null = null;

function createEventSource(): ExplorerTransactionsEventSource {
  const isSupported =
    typeof window !== 'undefined' &&
    typeof EventSource !== 'undefined';

  if (!isSupported) {
    return {
      data: ref<string | null>(null),
      status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED'),
      close: () => {},
    };
  }

  const addressFormat = useToriiAddressFormatPreference();
  const streamUrl = computed(() => {
    const streamUrl = new URL(buildExplorerUrl('/transactions/stream'), 'http://localhost');
    streamUrl.searchParams.set('address_format', addressFormat.value);
    return streamUrl.toString();
  });
  const { data, status, close } = useEventSource(streamUrl, [], { autoReconnect: true });
  return { data, status, close };
}

function reset() {
  sharedEvents?.close?.();
  sharedEvents = null;
  sharedScope?.stop();
  sharedScope = null;
}

export function useExplorerTransactionsEvents(): ExplorerTransactionsEventSource {
  if (!sharedEvents) {
    sharedScope = effectScope(true);
    const scopedState = sharedScope.run(() => createEventSource());
    if (!scopedState) {
      sharedScope.stop();
      sharedScope = null;
      throw new Error('[useExplorerTransactionsEvents] failed to initialize shared stream');
    }
    sharedEvents = scopedState;
  }

  consumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      consumers = Math.max(consumers - 1, 0);
      if (consumers === 0) reset();
    });
  }
  return sharedEvents;
}

export function __resetExplorerTransactionsEventsForTests() {
  consumers = 0;
  reset();
}
