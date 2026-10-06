import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import LatestTransactions from './LatestTransactions.vue';
import { i18n } from '@/shared/lib/localization';
import { historyCacheKey } from '@/shared/lib/history-cache';
import type { Transaction } from '@/shared/api/schemas';

const mocks = vi.hoisted(() => ({ fetchLatestTransactions: vi.fn() }));
const stream = {
  data: ref<string | null>(null),
  status: ref<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING'),
  close: vi.fn(),
};
const networkId = `hash:${'AB'.repeat(32)}#B99E`;
const toriiUrl = 'https://taira.sora.org';

vi.mock('@/shared/runtime-config', () => ({ getRuntimeConfig: () => ({ networkId }) }));
vi.mock('@/shared/api', () => ({
  fetchLatestTransactions: mocks.fetchLatestTransactions,
  getToriiBaseUrl: () => toriiUrl,
  useToriiAvailability: () => ({ state: ref('healthy') }),
  retryToriiFailover: vi.fn(),
}));
vi.mock('@/shared/ui/composables/useExplorerTransactionsEvents', () => ({
  useExplorerTransactionsEvents: () => stream,
}));

const StatusFilter = defineComponent({
  name: 'TransactionStatusFilter',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div />',
});
const transaction: Transaction = {
  authority: 'testuﾛ1NｵｦbﾐdjﾒeﾐｿkﾂoﾆZyﾅﾍｷ9ｱヱ3ｦFcﾚCｼqｦWﾗQP5ｷdGBW6CE',
  hash: 'a'.repeat(64),
  block: 1,
  created_at: new Date('2026-09-12T00:00:00Z'),
  executable: 'Instructions',
  status: 'Committed',
};
const snapshot = (items: Transaction[] = []) => ({
  status: 'ok',
  data: { nextCursor: null, total: undefined, items },
});
const failure = () => ({ status: 'unknown-error', error: new TypeError('history unavailable') });
const wrappers: Array<ReturnType<typeof mount>> = [];
const cache = new Map<string, string>();

function render() {
  const wrapper = mount(LatestTransactions, {
    global: {
      plugins: [i18n],
      stubs: {
        TransactionStatusFilter: StatusFilter,
        BaseContentBlock: { template: '<section><slot /></section>' },
        BaseButton: { template: '<button><slot /></button>' },
        BaseHash: { props: ['hash'], template: '<span>{{ hash }}</span>' },
        TransactionStatus: true,
        BaseLoading: true,
        TimeStamp: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchLatestTransactions.mockReset().mockResolvedValue(snapshot());
  stream.status.value = 'CONNECTING';
  stream.data.value = null;
  cache.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
  });
});

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LatestTransactions authoritative snapshot recovery', () => {
  it('recovers a failed first snapshot after SSE opens without receiving an event', async () => {
    mocks.fetchLatestTransactions.mockResolvedValueOnce(failure()).mockResolvedValueOnce(snapshot([transaction]));
    const wrapper = render();
    await flushPromises();
    stream.status.value = 'OPEN';
    await flushPromises();
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(transaction.hash);
    expect(stream.data.value).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
  });

  it('shows failed snapshots with a retry action that restores transaction rows', async () => {
    mocks.fetchLatestTransactions.mockResolvedValueOnce(failure()).mockResolvedValueOnce(snapshot([transaction]));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('transactions.unknownError'));
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(false);
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    await flushPromises();

    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(transaction.hash);
  });

  it('continues recovery while cached rows exist, then accepts an authoritative empty snapshot', async () => {
    stream.status.value = 'OPEN';
    cache.set(historyCacheKey('latest-transactions', networkId, toriiUrl)!, JSON.stringify({
      version: 1,
      updated_at_ms: Date.now(),
      items: [transaction],
    }));
    mocks.fetchLatestTransactions.mockResolvedValueOnce(failure()).mockResolvedValueOnce(snapshot());
    const wrapper = render();
    await flushPromises();
    expect(wrapper.text()).toContain(transaction.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
  });

  it('does not repeatedly poll a successful empty snapshot on an open stream', async () => {
    stream.status.value = 'OPEN';
    const wrapper = render();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.latest-transactions__row').exists()).toBe(false);
  });

  it('does not overlap or cancel a snapshot spanning multiple five-second polling ticks', async () => {
    stream.status.value = 'OPEN';
    const pending = Promise.withResolvers<ReturnType<typeof snapshot>>();
    mocks.fetchLatestTransactions.mockReturnValueOnce(pending.promise);
    const wrapper = render();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
    pending.resolve(snapshot([transaction]));
    await flushPromises();
    expect(wrapper.text()).toContain(transaction.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh successful snapshot for each filter, without publishing the previous filter result', async () => {
    stream.status.value = 'OPEN';
    const previous = Promise.withResolvers<ReturnType<typeof snapshot>>();
    const rejected = { ...transaction, hash: 'b'.repeat(64), status: 'Rejected' as const };
    mocks.fetchLatestTransactions.mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(failure()).mockResolvedValueOnce(snapshot([rejected]));
    const wrapper = render();
    wrapper.getComponent(StatusFilter).vm.$emit('update:modelValue', 'Rejected');
    await flushPromises();
    previous.resolve(snapshot([transaction]));
    await flushPromises();
    expect(wrapper.text()).not.toContain(transaction.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(3);
    expect(mocks.fetchLatestTransactions.mock.calls.map(([params]) => params.status)).toEqual([undefined, 'Rejected', 'Rejected']);
    expect(wrapper.text()).toContain(rejected.hash);
    expect(wrapper.text()).not.toContain(transaction.hash);
    stream.data.value = JSON.stringify(transaction);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).not.toContain(transaction.hash);
  });

  it('reconciles a reopened stream even when no event arrives and keeps existing rows visible', async () => {
    stream.status.value = 'OPEN';
    const next = { ...transaction, hash: 'c'.repeat(64) };
    mocks.fetchLatestTransactions.mockResolvedValueOnce(snapshot([transaction])).mockResolvedValueOnce(snapshot([next]));
    const wrapper = render();
    await flushPromises();
    stream.status.value = 'CONNECTING';
    stream.status.value = 'OPEN';
    await flushPromises();
    expect(wrapper.text()).toContain(transaction.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(next.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
  });

  it('does not let a request started before reconnect satisfy the new connection snapshot', async () => {
    stream.status.value = 'OPEN';
    const previous = Promise.withResolvers<ReturnType<typeof snapshot>>();
    mocks.fetchLatestTransactions.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(snapshot());
    render();
    stream.status.value = 'CONNECTING';
    stream.status.value = 'OPEN';
    previous.resolve(snapshot());
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
  });

  it('retains matching stream updates and retries failed event-triggered history refreshes', async () => {
    stream.status.value = 'OPEN';
    mocks.fetchLatestTransactions.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(failure()).mockResolvedValueOnce(snapshot([transaction]));
    const wrapper = render();
    await flushPromises();
    stream.data.value = JSON.stringify(transaction);
    await flushPromises();
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(transaction.hash);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.fetchLatestTransactions).toHaveBeenCalledTimes(3);
  });
});
