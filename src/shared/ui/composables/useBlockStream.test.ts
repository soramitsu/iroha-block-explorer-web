import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, toValue } from 'vue';
import { useBlockStream } from './useBlockStream';
import { activateExplorerReadSession, disconnectExplorerReadSession } from '@/shared/lib/explorer-read-auth';

const streams = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@vueuse/core', () => ({ useEventSource: (...args: unknown[]) => streams.create(...args) }));
vi.mock('@/shared/api', () => ({ buildExplorerUrl: (path: string) => `https://taira.sora.org/v1/explorer${path}` }));
let stream: { data: ReturnType<typeof ref<string | null>>, status: ReturnType<typeof ref<string>>, close: ReturnType<typeof vi.fn>, open: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined);
  stream = { data: ref(null), status: ref('CLOSED'), close: vi.fn(), open: vi.fn() };
  stream.close.mockImplementation(() => { stream.status.value = 'CLOSED'; });
  stream.open.mockImplementation(() => { stream.status.value = 'OPEN'; });
  streams.create.mockReset().mockReturnValue(stream);
});
afterEach(() => { disconnectExplorerReadSession(); vi.unstubAllGlobals(); });

function activateReader() {
  activateExplorerReadSession({ baseUrl: 'https://taira.sora.org', networkId: 'network-a',
    auth: { authAccountId: 'reader@bank', sign: async () => new Uint8Array(64) }, close: vi.fn() });
}

describe('useBlockStream', () => {
  it('is a safe no-op when block websocket streaming is unavailable', () => {
    const onBlock = () => undefined;
    const scope = effectScope();

    let api!: ReturnType<typeof useBlockStream>;
    scope.run(() => {
      api = useBlockStream(onBlock);
    });

    expect(api.isSupported).toBe(false);
    expect(api.isStreaming.value).toBe(false);
    expect(() => api.connectFrom(10)).not.toThrow();
    expect(() => api.disconnect()).not.toThrow();

    scope.stop();
  });

  it('keeps authenticated block reads on signed polling without opening an unsigned stream', () => {
    vi.stubGlobal('EventSource', class {});
    activateReader();
    const scope = effectScope();
    const api = scope.run(() => useBlockStream(vi.fn()))!;
    api.connectFrom(10);
    expect(toValue(streams.create.mock.calls[0][0])).toBeUndefined();
    expect(api.isStreaming.value).toBe(false);
    expect(stream.open).not.toHaveBeenCalled();
    scope.stop();
  });

  it('closes a public stream immediately on login and ignores late public events', async () => {
    vi.stubGlobal('EventSource', class {});
    const onBlock = vi.fn();
    const scope = effectScope();
    const api = scope.run(() => useBlockStream(onBlock))!;
    api.connectFrom(10);
    expect(api.isStreaming.value).toBe(true);
    stream.data.value = '{"height":11}';
    await nextTick();
    expect(onBlock).toHaveBeenCalledOnce();
    activateReader();
    expect(stream.close).toHaveBeenCalled();
    expect(stream.data.value).toBeNull();
    expect(api.isStreaming.value).toBe(false);
    stream.data.value = '{"height":12}';
    await nextTick();
    expect(onBlock).toHaveBeenCalledOnce();
    scope.stop();
  });
});
