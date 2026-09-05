import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { effectScope, nextTick } from 'vue';
import { setupAsyncData } from './setup-async-data';

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
  it('exposes an initial error without starting a hidden retry loop', async () => {
    vi.useFakeTimers();

    const fetcher = vi.fn<() => Promise<number>>().mockRejectedValue(new TypeError('offline'));
    let api!: ReturnType<typeof setupAsyncData<number>>;

    const scope = effectScope();
    scope.run(() => {
      api = setupAsyncData(fetcher);
    });

    await flushPromises();
    await nextTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(api.snapshot).toEqual({
      status: 'error',
      problem: { kind: 'network', message: 'offline' },
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1);

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
    expect(api.snapshot).toEqual({ status: 'ready', data: 1, isRefreshing: true, refreshError: null });

    second.resolve(2);
    await flushPromises();
    await nextTick();

    expect(api.isLoading).toBe(false);
    expect(api.data).toBe(2);

    scope.stop();
  });

  it('retains ready data and exposes a refresh error', async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('bad payload'));
    let api!: ReturnType<typeof setupAsyncData<number>>;
    const scope = effectScope();
    scope.run(() => {
      api = setupAsyncData(fetcher);
    });

    await flushPromises();
    await api.refetch();

    expect(api.data).toBe(1);
    expect(api.snapshot).toEqual({
      status: 'ready',
      data: 1,
      isRefreshing: false,
      refreshError: { kind: 'invalid-response', message: 'bad payload' },
    });
    scope.stop();
  });

  it('maps API not-found and error results without treating them as empty data', async () => {
    const fetchNotFound = () => Promise.resolve({ status: 'not-found' as const });
    const fetchError = () => Promise.resolve({ status: 'unknown-error' as const, error: new Error('schema') });
    const notFoundScope = effectScope();
    let notFound!: ReturnType<typeof setupAsyncData<{ status: 'not-found' }>>;
    notFoundScope.run(() => {
      notFound = setupAsyncData(fetchNotFound);
    });
    await flushPromises();
    expect(notFound.notFound).toBe(true);
    expect(notFound.data).toBeUndefined();
    notFoundScope.stop();

    const errorScope = effectScope();
    let failed!: ReturnType<typeof setupAsyncData<{ status: 'unknown-error', error: Error }>>;
    errorScope.run(() => {
      failed = setupAsyncData(fetchError);
    });
    await flushPromises();
    expect(failed.snapshot).toEqual({
      status: 'error',
      problem: { kind: 'invalid-response', message: 'schema' },
    });
    errorScope.stop();
  });

  it('ignores an older explicit refresh that resolves after a newer one', async () => {
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

    const latest = api.refetch();
    second.resolve(2);
    await latest;
    first.resolve(1);
    await flushPromises();

    expect(api.data).toBe(2);
    expect(api.snapshot).toEqual({ status: 'ready', data: 2, isRefreshing: false, refreshError: null });
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
