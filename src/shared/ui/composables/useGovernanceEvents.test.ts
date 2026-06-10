import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { effectScope, onScopeDispose, ref } from 'vue';

const hoisted = vi.hoisted(() => ({
  listeners: [] as Array<{
    status: ReturnType<typeof ref<'CONNECTING' | 'OPEN' | 'CLOSED'>>
    data: ReturnType<typeof ref<string | null>>
    source: unknown
  }>,
  emit(payload: string) {
    for (const listener of this.listeners) {
      listener.status.value = 'OPEN';
      listener.data.value = payload;
    }
  },
}));

vi.mock('@vueuse/core', () => ({
  useEventSource: vi.fn((source: unknown) => {
    const status = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING');
    const data = ref<string | null>(null);
    const listener = { status, data, source };
    hoisted.listeners.push(listener);
    const close = () => {
      const index = hoisted.listeners.indexOf(listener);
      if (index >= 0) hoisted.listeners.splice(index, 1);
      status.value = 'CLOSED';
      data.value = null;
    };
    onScopeDispose(close);
    return { data, status, close };
  }),
}));

import { useGovernanceEvents, __resetGovernanceEventsForTests } from './useGovernanceEvents';

describe('useGovernanceEvents', () => {
  beforeEach(() => {
    __resetGovernanceEventsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares a single state instance across consumers', () => {
    const first = useGovernanceEvents();
    const second = useGovernanceEvents();
    expect(first).toBe(second);
  });

  it('uses polling fallback state by default', () => {
    const state = useGovernanceEvents();
    expect(state.status.value).toBe('CLOSED');
    expect(state.data.value).toBeNull();
  });

  it('keeps the shared stream active until the last consumer unmounts', () => {
    vi.stubGlobal('EventSource', class {} as any);

    const firstScope = effectScope();
    const first = firstScope.run(() => useGovernanceEvents());
    const secondScope = effectScope();
    const second = secondScope.run(() => useGovernanceEvents());

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(hoisted.listeners).toHaveLength(1);
    expect((hoisted.listeners[0]?.source as { value?: string }).value).toContain('/v1/gov/stream');

    firstScope.stop();
    expect(hoisted.listeners).toHaveLength(1);

    hoisted.emit('{"kind":"CouncilUpdated"}');
    expect(second?.status.value).toBe('OPEN');
    expect(second?.data.value).toBe('{"kind":"CouncilUpdated"}');

    secondScope.stop();
    expect(hoisted.listeners).toHaveLength(0);
  });
});
