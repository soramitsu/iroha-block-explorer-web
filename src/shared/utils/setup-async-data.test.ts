import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { effectScope, nextTick } from 'vue';
import { setupAsyncData } from './setup-async-data';

const mocks = vi.hoisted(() => ({
  handleUnknownError: vi.fn(),
}));

vi.mock('@/shared/ui/composables/useErrorHandlers', () => ({
  useErrorHandlers: () => ({
    handleUnknownError: mocks.handleUnknownError,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('setupAsyncData', () => {
  beforeEach(() => {
    mocks.handleUnknownError.mockReset();
  });

  it('deduplicates default error notifications until a success occurs', async () => {
    vi.useFakeTimers();

    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('boom'));

    const scope = effectScope();
    scope.run(() => {
      setupAsyncData(fetcher, { interval: 5000 });
    });

    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.handleUnknownError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.handleUnknownError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(mocks.handleUnknownError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(mocks.handleUnknownError).toHaveBeenCalledTimes(2);

    scope.stop();
    vi.useRealTimers();
  });

  it('keeps stale data while a refetch is pending', async () => {
    const first = deferred<number>();
    const second = deferred<number>();

    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    let api!: ReturnType<typeof setupAsyncData<number>>;

    const scope = effectScope();
    scope.run(() => {
      api = setupAsyncData(fetcher);
    });

    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(api.isLoading).toBe(true);
    expect(api.data).toBeUndefined();

    first.resolve(1);
    await flushPromises();
    await nextTick();

    expect(api.isLoading).toBe(false);
    expect(api.data).toBe(1);

    api.refetch();
    await nextTick();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(api.isLoading).toBe(true);
    expect(api.data).toBe(1);

    second.resolve(2);
    await flushPromises();
    await nextTick();

    expect(api.isLoading).toBe(false);
    expect(api.data).toBe(2);

    scope.stop();
  });

  it('polls when interval is provided', async () => {
    vi.useFakeTimers();

    const fetcher = vi.fn<() => Promise<number>>().mockResolvedValue(1);

    let api!: ReturnType<typeof setupAsyncData<number>>;
    const scope = effectScope();
    scope.run(() => {
      api = setupAsyncData(fetcher, { interval: 5000 });
    });

    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(api.data).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();

    expect(fetcher).toHaveBeenCalledTimes(2);

    scope.stop();
    vi.useRealTimers();
  });

  it('does not duplicate startup fetches when polling is enabled', async () => {
    vi.useFakeTimers();

    const first = deferred<number>();
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(2);

    const scope = effectScope();
    scope.run(() => {
      setupAsyncData(fetcher, { interval: 5000 });
    });

    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    first.resolve(1);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(2);

    scope.stop();
    vi.useRealTimers();
  });

  it('honors pollWhen while polling', async () => {
    vi.useFakeTimers();

    let enabled = false;
    const fetcher = vi.fn<() => Promise<number>>().mockResolvedValue(1);

    const scope = effectScope();
    scope.run(() => {
      setupAsyncData(fetcher, { interval: 5000, pollWhen: () => enabled });
    });

    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    enabled = true;
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(2);

    scope.stop();
    vi.useRealTimers();
  });

  it('starts polling even when immediate is false', async () => {
    vi.useFakeTimers();

    const fetcher = vi.fn<() => Promise<number>>().mockResolvedValue(1);

    let api!: ReturnType<typeof setupAsyncData<number>>;
    const scope = effectScope();
    scope.run(() => {
      api = setupAsyncData(fetcher, { interval: 5000, immediate: false });
    });

    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(0);
    expect(api.data).toBeUndefined();

    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await nextTick();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(api.data).toBe(1);

    scope.stop();
    vi.useRealTimers();
  });
});
