import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { createSoracloudSection, SORACLOUD_POLL_INTERVAL_MS } from './useSoracloudSection';

const mocks = vi.hoisted(() => ({
  toriiBaseUrl: null as any,
  requests: [] as Array<{
    fetcher: () => Promise<unknown>
    options: Record<string, unknown> | undefined
    request: { isLoading: boolean, data: unknown, refetch: ReturnType<typeof vi.fn> }
  }>,
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => `t:${key}`,
  }),
}));

vi.mock('@/shared/api', async () => {
  const { ref } = await import('vue');
  mocks.toriiBaseUrl = ref('https://torii-a.test');

  return {
    getToriiBaseUrl: () => mocks.toriiBaseUrl.value,
  };
});

vi.mock('@/shared/utils/setup-async-data', async () => {
  const { reactive } = await import('vue');

  return {
    setupAsyncData: vi.fn((fetcher: () => Promise<unknown>, options?: Record<string, unknown>) => {
      const request = reactive({
        isLoading: false,
        data: undefined as unknown,
        refetch: vi.fn(),
      });

      mocks.requests.push({ fetcher, options, request });
      return request;
    }),
  };
});

describe('createSoracloudSection', () => {
  beforeEach(() => {
    mocks.requests.length = 0;
    if (mocks.toriiBaseUrl) mocks.toriiBaseUrl.value = 'https://torii-a.test';
  });

  it('configures polling and refetches when an initially idle section becomes ready', async () => {
    const load = vi.fn().mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: { ok: true } });

    const scope = effectScope();
    let section!: ReturnType<typeof createSoracloudSection<{ service_name: string }, { ok: boolean }>>;
    scope.run(() => {
      section = createSoracloudSection({
        initialQuery: null,
        immediate: false,
        isReady: (query) => Boolean(query?.service_name.trim()),
        load,
      });
    });

    expect(mocks.requests).toHaveLength(1);
    expect(mocks.requests[0]?.options).toMatchObject({
      interval: SORACLOUD_POLL_INTERVAL_MS,
      immediate: false,
    });
    expect(section.ready).toBe(false);

    expect(section.apply({ service_name: '   ' })).toBe(false);
    expect(mocks.requests[0]?.request.refetch).not.toHaveBeenCalled();

    expect(section.apply({ service_name: 'portal' })).toBe(true);
    await nextTick();

    expect(section.ready).toBe(true);
    expect(section.activeQuery).toEqual({ service_name: 'portal' });
    expect(mocks.requests[0]?.request.refetch).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('refetches when the ready query repeats, changes, or the Torii base URL changes', async () => {
    const scope = effectScope();
    let section!: ReturnType<typeof createSoracloudSection<{ apartment_name: string }, { ok: boolean }>>;
    scope.run(() => {
      section = createSoracloudSection({
        initialQuery: { apartment_name: 'tenant-a' },
        isReady: (query) => Boolean(query?.apartment_name.trim()),
        load: async () => ({ status: SUCCESSFUL_FETCHING, data: { ok: true } }),
      });
    });

    const request = mocks.requests[0]?.request;
    expect(request).toBeTruthy();

    expect(section.apply({ apartment_name: 'tenant-a' })).toBe(true);
    expect(request?.refetch).toHaveBeenCalledTimes(1);

    expect(section.apply({ apartment_name: 'tenant-b' })).toBe(true);
    await nextTick();
    expect(request?.refetch).toHaveBeenCalledTimes(2);

    mocks.toriiBaseUrl.value = 'https://torii-b.test';
    await nextTick();
    expect(request?.refetch).toHaveBeenCalledTimes(3);

    scope.stop();
  });

  it('translates idle, not-found, and unknown-error results into section state', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ status: SUCCESSFUL_FETCHING, data: { ok: true } })
      .mockResolvedValueOnce({ status: NOT_FOUND })
      .mockResolvedValueOnce({ status: UNKNOWN_ERROR, error: new Error('boom') });

    const scope = effectScope();
    let section!: ReturnType<typeof createSoracloudSection<{ service_name: string }, { ok: boolean }>>;
    scope.run(() => {
      section = createSoracloudSection({
        initialQuery: null,
        immediate: false,
        isReady: (query) => Boolean(query?.service_name.trim()),
        load,
        errorKey: 'soracloud.sectionLoadFailed',
        notFoundKey: 'soracloud.notFound',
      });
    });

    const fetcher = mocks.requests[0]?.fetcher;
    expect(fetcher).toBeTruthy();

    await expect(fetcher?.()).rejects.toThrow('t:soracloud.queryIdle');

    section.apply({ service_name: 'portal' });
    await nextTick();

    await expect(fetcher?.()).resolves.toEqual({ ok: true });
    expect(section.error).toBeNull();

    await expect(fetcher?.()).rejects.toThrow('t:soracloud.notFound');
    expect(section.error).toBe('t:soracloud.notFound');

    await expect(fetcher?.()).rejects.toThrow('boom');
    expect(section.error).toBe('boom');

    scope.stop();
  });
});
