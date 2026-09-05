import { computed, effectScope, getCurrentScope, onScopeDispose, ref } from 'vue';
import type { Ref } from 'vue';
import type { EffectScope } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildToriiUrl } from '@/shared/api';

interface ExplorerInstructionsEventSource {
  data: Ref<string | null>;
  status: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>;
  close: () => void;
}

let sharedEvents: ExplorerInstructionsEventSource | null = null;
let consumers = 0;
let sharedScope: EffectScope | null = null;

function createEventSource(): ExplorerInstructionsEventSource {
  const isSupported = typeof window !== 'undefined' && typeof EventSource !== 'undefined';

  if (!isSupported) {
    return {
      data: ref<string | null>(null),
      status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED'),
      close: () => {},
    };
  }

  const streamUrl = computed(() => buildToriiUrl('/v1/explorer/instructions/stream'));
  const { data, status, close } = useEventSource(streamUrl, [], { autoReconnect: true });
  return { data, status, close };
}

function reset() {
  sharedEvents?.close?.();
  sharedEvents = null;
  sharedScope?.stop();
  sharedScope = null;
}

export function useExplorerInstructionsEvents(): ExplorerInstructionsEventSource {
  if (!sharedEvents) {
    sharedScope = effectScope(true);
    const scopedState = sharedScope.run(() => createEventSource());
    if (!scopedState) {
      sharedScope.stop();
      sharedScope = null;
      throw new Error('[useExplorerInstructionsEvents] failed to initialize shared stream');
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

export function __resetExplorerInstructionsEventsForTests() {
  consumers = 0;
  reset();
}
