import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import type { Ref } from 'vue';
import type { Block } from '@/shared/api/schemas';

const eventSourceMock = vi.hoisted(() => ({
  data: null as Ref<string | null> | null,
  status: null as Ref<'CONNECTING' | 'OPEN' | 'CLOSED'> | null,
  close: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  eventSourceMock.data = ref<string | null>(null);
  eventSourceMock.status = ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CLOSED');
  return {
    useEventSource: () => ({
      data: eventSourceMock.data,
      status: eventSourceMock.status,
      close: eventSourceMock.close,
      open: eventSourceMock.open,
    }),
  };
});

vi.mock('@/shared/api', () => ({
  buildToriiUrl: (path: string) => `https://torii.example${path}`,
}));

import { useBlockStream } from './useBlockStream';

const originalEventSource = globalThis.EventSource;
const hash = 'a'.repeat(64);

function block(overrides: Partial<Record<keyof Block, unknown>> = {}) {
  return {
    hash,
    height: 12,
    created_at: '2026-08-31T00:00:00Z',
    prev_block_hash: null,
    transactions_hash: null,
    transactions_rejected: 0,
    transactions_total: 1,
    ...overrides,
  };
}

function enableEventSource() {
  globalThis.EventSource = class MockEventSource {} as unknown as typeof EventSource;
}

function ignoreBlock() {}

describe('useBlockStream', () => {
  beforeEach(() => {
    eventSourceMock.data!.value = null;
    eventSourceMock.status!.value = 'CLOSED';
    eventSourceMock.close.mockReset();
    eventSourceMock.open.mockReset();
  });

  afterEach(() => {
    if (originalEventSource) globalThis.EventSource = originalEventSource;
    else delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
  });

  it('is a safe no-op when block streaming is unavailable', () => {
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
    const scope = effectScope();

    const api = scope.run(() => useBlockStream(ignoreBlock))!;

    expect(api.isSupported).toBe(false);
    expect(api.isStreaming.value).toBe(false);
    expect(api.error.value).toBeNull();
    expect(() => api.connectFrom(10)).not.toThrow();
    expect(() => api.disconnect()).not.toThrow();

    scope.stop();
  });

  it('rejects non-JSON messages and surfaces the parse error without refreshing', async () => {
    enableEventSource();
    const onBlock = vi.fn();
    const scope = effectScope();
    const api = scope.run(() => useBlockStream(onBlock))!;

    api.connectFrom(10);
    await nextTick();
    eventSourceMock.data!.value = 'not-json';
    await nextTick();

    expect(onBlock).not.toHaveBeenCalled();
    expect(api.error.value).toBeInstanceOf(SyntaxError);
    scope.stop();
  });

  it('rejects schema-invalid JSON and clears the error only after an exact block arrives', async () => {
    enableEventSource();
    const onBlock = vi.fn();
    const scope = effectScope();
    const api = scope.run(() => useBlockStream(onBlock))!;

    api.connectFrom(10);
    await nextTick();
    eventSourceMock.data!.value = JSON.stringify(block({ hash: 'not-a-hash' }));
    await nextTick();

    expect(onBlock).not.toHaveBeenCalled();
    expect(api.error.value).not.toBeNull();

    eventSourceMock.data!.value = JSON.stringify(block());
    await nextTick();

    expect(api.error.value).toBeNull();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onBlock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ hash, height: 12 }));
    expect(onBlock.mock.calls[0]?.[0].created_at).toBeInstanceOf(Date);
    scope.stop();
  });

  it('validates but ignores exact blocks older than the requested height', async () => {
    enableEventSource();
    const onBlock = vi.fn();
    const scope = effectScope();
    const api = scope.run(() => useBlockStream(onBlock))!;

    api.connectFrom(10);
    await nextTick();
    eventSourceMock.data!.value = JSON.stringify(block({ height: 9 }));
    await nextTick();

    expect(api.error.value).toBeNull();
    expect(onBlock).not.toHaveBeenCalled();
    scope.stop();
  });
});
