import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import type * as VueRouterModule from 'vue-router';
import SearchResults from './SearchResults.vue';
import { i18n } from '@/shared/lib/localization';
import { NOT_FOUND, SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const HASH_A = '0301b76be6d3dead32484180986523173082d770bc4fd954760d0a74a434624f';
const HASH_B = '1'.repeat(64);
const routeState = reactive({ query: { q: HASH_A } });

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof VueRouterModule>();
  return {
    ...actual,
    useRoute: () => routeState,
  };
});

vi.mock('@/shared/api', () => ({
  fetchBlock: vi.fn(),
  fetchTransaction: vi.fn(),
  getToriiBaseUrl: vi.fn(() => 'http://localhost:8080'),
}));

import * as api from '@/shared/api';

const fetchBlock = api.fetchBlock as unknown as ReturnType<typeof vi.fn>;
const fetchTransaction = api.fetchTransaction as unknown as ReturnType<typeof vi.fn>;

function block(hash = HASH_A, height = 12) {
  return {
    hash,
    height,
    created_at: new Date('2026-07-21T00:00:00Z'),
    prev_block_hash: null,
    transactions_hash: null,
    transactions_rejected: 0,
    transactions_total: 1,
  };
}

function transaction(hash = HASH_A, blockHeight = 12) {
  return {
    authority: 'alice@wonderland',
    hash,
    block: blockHeight,
    created_at: new Date('2026-07-21T00:00:00Z'),
    executable: 'Instructions',
    status: 'Committed',
    rejection_reason: null,
    metadata: {},
    nonce: null,
    signature: 'signature',
    time_to_live: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h1>{{ title }}</h1><slot /></section>',
};

const DataFieldStub = {
  props: ['title', 'value', 'hash'],
  template:
    '<div class="data-field-stub" :data-title="title" :data-value="value">{{ title }} {{ value }} {{ hash }}</div>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a href="#"><slot /></a>',
};

const BaseButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};

const mountedWrappers: VueWrapper[] = [];

function mountPage() {
  const wrapper = mount(SearchResults, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: BaseContentBlockStub,
        DataField: DataFieldStub,
        BaseLink: BaseLinkStub,
        BaseButton: BaseButtonStub,
        BaseLoading: { template: '<span>loading</span>' },
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe('SearchResults', () => {
  beforeEach(() => {
    routeState.query.q = HASH_A;
    fetchBlock.mockReset();
    fetchTransaction.mockReset();
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  });

  it('shows block and transaction matches returned by the two exact probes', async () => {
    fetchBlock.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: block() });
    fetchTransaction.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: transaction() });

    const wrapper = mountPage();
    await flushPromises();

    expect(fetchBlock).toHaveBeenCalledTimes(1);
    expect(fetchBlock).toHaveBeenCalledWith(HASH_A);
    expect(fetchTransaction).toHaveBeenCalledTimes(1);
    expect(fetchTransaction).toHaveBeenCalledWith(HASH_A);
    expect(wrapper.find('[data-test="search-result-block"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-result-transaction"]').exists()).toBe(true);
  });

  it('keeps a partial match visible and retries only after the user asks', async () => {
    fetchBlock.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: block() });
    fetchTransaction.mockRejectedValueOnce(new TypeError('offline'));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="search-result-block"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-result-transaction"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="search-result-transaction-notice"]').attributes('role')).toBe('alert');
    expect(fetchTransaction).toHaveBeenCalledTimes(1);

    fetchTransaction.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: transaction() });
    await wrapper.get('[data-test="search-results-partial-retry"]').trigger('click');
    await flushPromises();

    expect(fetchBlock).toHaveBeenCalledTimes(2);
    expect(fetchTransaction).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-test="search-result-transaction"]').exists()).toBe(true);
  });

  it('shows a transaction-only result as a definitive partial match when the block probe returns 404', async () => {
    fetchBlock.mockResolvedValue({ status: NOT_FOUND });
    fetchTransaction.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: transaction() });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-test="search-result-block"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="search-result-transaction"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="search-result-block-notice"]').attributes('role')).toBe('status');
    expect(wrapper.find('[data-test="search-results-partial-retry"]').exists()).toBe(false);
  });

  it('announces two authoritative misses as not found', async () => {
    fetchBlock.mockResolvedValue({ status: NOT_FOUND });
    fetchTransaction.mockResolvedValue({ status: NOT_FOUND });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="search-results-not-found"]').text()).toContain('No block or transaction');
    expect(wrapper.find('[data-test="resource-retry"]').exists()).toBe(false);
  });

  it('shows a failed zero-match lookup as an error with an explicit retry', async () => {
    fetchBlock.mockResolvedValue({ status: NOT_FOUND });
    fetchTransaction.mockRejectedValue(new TypeError('offline'));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="search-results-error"]').text()).toContain('unreachable');
    expect(wrapper.find('[data-test="resource-retry"]').exists()).toBe(true);

    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    await flushPromises();
    expect(fetchBlock).toHaveBeenCalledTimes(2);
    expect(fetchTransaction).toHaveBeenCalledTimes(2);
  });

  it('keeps the newest route query authoritative when an older lookup resolves last', async () => {
    const blockA = deferred<unknown>();
    const transactionA = deferred<unknown>();
    const blockB = deferred<unknown>();
    const transactionB = deferred<unknown>();
    fetchBlock.mockImplementation((hash: string) => (hash === HASH_A ? blockA.promise : blockB.promise));
    fetchTransaction.mockImplementation((hash: string) =>
      hash === HASH_A ? transactionA.promise : transactionB.promise
    );

    const wrapper = mountPage();
    routeState.query.q = HASH_B;
    await nextTick();

    blockB.resolve({ status: SUCCESSFUL_FETCHING, data: block(HASH_B, 22) });
    transactionB.resolve({ status: NOT_FOUND });
    await flushPromises();
    expect(wrapper.get('[data-test="search-result-block"] [data-title="Height"]').attributes('data-value')).toBe('22');

    blockA.resolve({ status: SUCCESSFUL_FETCHING, data: block(HASH_A, 11) });
    transactionA.resolve({ status: NOT_FOUND });
    await flushPromises();
    expect(wrapper.get('[data-test="search-result-block"] [data-title="Height"]').attributes('data-value')).toBe('22');
  });

  it('does not call either endpoint for a malformed direct URL query', async () => {
    routeState.query.q = '0xabc123';
    const wrapper = mountPage();
    await flushPromises();

    expect(fetchBlock).not.toHaveBeenCalled();
    expect(fetchTransaction).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="search-results-error"]').text()).toContain('64 hexadecimal');
  });
});
