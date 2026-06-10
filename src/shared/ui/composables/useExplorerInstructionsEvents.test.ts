import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, onScopeDispose, ref } from 'vue';

const hoisted = vi.hoisted(() => ({
  listeners: [] as Array<{
    status: ReturnType<typeof ref<'CONNECTING' | 'OPEN' | 'CLOSED'>>
    data: ReturnType<typeof ref<string | null>>
    url: string
  }>,
}));

vi.mock('@vueuse/core', () => ({
  useEventSource: vi.fn((source: unknown) => {
    const url = typeof source === 'string'
      ? source
      : source && typeof source === 'object' && 'value' in source
        ? String((source as { value: unknown }).value)
        : String(source ?? '');
    const status = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING');
    const data = ref<string | null>(null);
    const listener = { status, data, url };
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

import {
  __resetExplorerInstructionsEventsForTests,
  useExplorerInstructionsEvents,
} from './useExplorerInstructionsEvents';

describe('useExplorerInstructionsEvents', () => {
  beforeEach(() => {
    __resetExplorerInstructionsEventsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares a single stream instance across consumers', () => {
    const first = useExplorerInstructionsEvents();
    const second = useExplorerInstructionsEvents();
    expect(first).toBe(second);
  });

  it('exposes closed fallback state when EventSource is unsupported', () => {
    const state = useExplorerInstructionsEvents();
    expect(state.status.value).toBe('CLOSED');
    expect(state.data.value).toBeNull();
  });

  it('keeps the stream open until the last consumer scope is disposed', () => {
    vi.stubGlobal('EventSource', class {} as any);

    const firstScope = effectScope();
    firstScope.run(() => useExplorerInstructionsEvents());
    const secondScope = effectScope();
    secondScope.run(() => useExplorerInstructionsEvents());

    expect(hoisted.listeners).toHaveLength(1);
    expect(hoisted.listeners[0]?.url).toContain('/v1/explorer/instructions/stream');
    expect(hoisted.listeners[0]?.url).toContain('address_format=i105');

    firstScope.stop();
    expect(hoisted.listeners).toHaveLength(1);

    secondScope.stop();
    expect(hoisted.listeners).toHaveLength(0);
  });
});
