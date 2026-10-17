import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, onScopeDispose, ref } from 'vue';
import { activateExplorerReadSession, disconnectExplorerReadSession } from '@/shared/lib/explorer-read-auth';

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
    disconnectExplorerReadSession();
    __resetExplorerInstructionsEventsForTests();
    hoisted.listeners.splice(0, hoisted.listeners.length);
  });

  afterEach(() => {
    disconnectExplorerReadSession();
    vi.unstubAllGlobals();
  });

  it('closes anonymous deltas on login and keeps authenticated readers on signed snapshots', () => {
    vi.stubGlobal('EventSource', class {} as any);
    const scope = effectScope();
    const stream = scope.run(() => useExplorerInstructionsEvents())!;
    expect(hoisted.listeners).toHaveLength(1);
    stream.data.value = 'public event';
    activateExplorerReadSession({ baseUrl: 'https://taira.sora.org', networkId: 'network-a',
      auth: { authAccountId: 'reader@bank', sign: async () => new Uint8Array(64) }, close: vi.fn() });
    expect(stream.status.value).toBe('CLOSED');
    expect(stream.data.value).toBeNull();
    expect(hoisted.listeners).toHaveLength(0);
    scope.stop();
    const privateScope = effectScope();
    const privateStream = privateScope.run(() => useExplorerInstructionsEvents())!;
    expect(privateStream.status.value).toBe('CLOSED');
    expect(hoisted.listeners).toHaveLength(0);
    privateScope.stop();
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
    expect(new URL(hoisted.listeners[0]!.url).searchParams.has('address_format')).toBe(false);

    firstScope.stop();
    expect(hoisted.listeners).toHaveLength(1);

    secondScope.stop();
    expect(hoisted.listeners).toHaveLength(0);
  });
});
