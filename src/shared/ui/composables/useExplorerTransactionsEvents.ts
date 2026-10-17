import { computed, effectScope, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { EffectScope } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildExplorerUrl } from '@/shared/api';
import { explorerReadIsPublic, explorerReadAuthRevision } from '@/shared/lib/explorer-read-auth';

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

  if (!isSupported || !explorerReadIsPublic.value) {
    return {
      data: ref<string | null>(null),
      status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED'),
      close: () => {},
    };
  }

  const streamUrl = computed(() => buildExplorerUrl('/transactions/stream'));
  const { data, status, close } = useEventSource(streamUrl, [], { autoReconnect: true });
  // Native EventSource cannot sign canonical account headers. Authenticated
  // views refresh through their signed SDK snapshots instead.
  watch(explorerReadAuthRevision, () => { close(); data.value = null; }, { flush: 'sync' });
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
