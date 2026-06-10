import { computed, getCurrentScope, onScopeDispose, ref, effectScope } from 'vue';
import type { Ref } from 'vue';
import type { EffectScope } from 'vue';
import { useEventSource } from '@vueuse/core';
import { buildToriiUrl } from '@/shared/api';

interface GovernanceEventSource {
  data: Ref<string | null>
  status: Ref<'CONNECTING' | 'OPEN' | 'CLOSED'>
  close: () => void
}

let sharedEvents: GovernanceEventSource | null = null;
let consumers = 0;
let sharedScope: EffectScope | null = null;

function createEventSource(): GovernanceEventSource {
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

  const streamUrl = computed(() => buildToriiUrl('/gov/stream'));
  const { data, status, close } = useEventSource(streamUrl, [], { autoReconnect: true });

  return {
    data,
    status,
    close,
  };
}

function reset() {
  sharedEvents?.close?.();
  sharedEvents = null;
  sharedScope?.stop();
  sharedScope = null;
}

export function useGovernanceEvents(): GovernanceEventSource {
  if (!sharedEvents) {
    sharedScope = effectScope(true);
    const scopedState = sharedScope.run(() => createEventSource());
    if (!scopedState) {
      sharedScope.stop();
      sharedScope = null;
      throw new Error('[useGovernanceEvents] failed to initialize shared governance stream');
    }
    sharedEvents = scopedState;
  }
  consumers += 1;
  const scope = getCurrentScope();
  if (scope) {
    onScopeDispose(() => {
      consumers = Math.max(consumers - 1, 0);
      if (consumers === 0) {
        reset();
      }
    });
  }
  return sharedEvents;
}

export function __resetGovernanceEventsForTests() {
  consumers = 0;
  reset();
}
