import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ToriiStreamGapError } from '@iroha/iroha-js/torii-browser';
import SmartContractsPage from './SmartContractsPage.vue';
import { i18n } from '@/shared/lib/localization';

const contractAddress = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const contractAlias = 'router::universal';
const accountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const activityHash = 'c'.repeat(64);
const eventTransactionHash = 'd'.repeat(64);
const eventBlockHash = 'e'.repeat(64);

const apiState = vi.hoisted(() => ({
  activity: null as any,
  events: null as any,
  streamImplementation: (() => (async function* () {})()) as (
    filters: Record<string, unknown>,
    signal?: AbortSignal
  ) => AsyncGenerator<any, void, unknown>,
}));

const apiMocks = vi.hoisted(() => ({
  fetchContractActivity: vi.fn(async () => apiState.activity),
  fetchContractEvents: vi.fn(async () => apiState.events),
  streamContractEvents: vi.fn((filters: Record<string, unknown>, signal?: AbortSignal) =>
    apiState.streamImplementation(filters, signal)
  ),
}));

vi.mock('@/shared/api', () => apiMocks);

const BaseContentBlockStub = {
  props: ['title'],
  template: '<main><h1>{{ title }}</h1><slot /></main>',
};

const BaseTabsStub = {
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
  template: `
    <nav>
      <button
        v-for="item in items"
        :key="item.value"
        :class="'tab-' + item.value"
        :aria-pressed="item.value === modelValue"
        @click="$emit('update:modelValue', item.value)"
      >{{ item.label }}</button>
    </nav>
  `,
};

const BaseTableStub = {
  props: ['items', 'cursorPagination'],
  emits: ['click:row', 'update:page', 'update:pageSize'],
  template: `
    <div class="table-stub" :data-next-cursor="cursorPagination?.nextCursor ?? ''">
      <slot name="header" />
      <button
        v-for="(item, index) in items"
        :key="index"
        class="row-button"
        type="button"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </button>
    </div>
  `,
};

const BaseResourceStateStub = {
  props: ['snapshot', 'retryLabel', 'errorLabel'],
  emits: ['retry'],
  template: `
    <section class="resource-state" :data-status="snapshot.status">
      <slot v-if="snapshot.status === 'ready'" :data="snapshot.data" />
      <template v-else-if="snapshot.status === 'error'">
        <div class="resource-error"><slot name="error" :problem="snapshot.problem">{{ errorLabel }}</slot></div>
        <button class="resource-retry" @click="$emit('retry')">{{ retryLabel }}</button>
      </template>
      <div v-else-if="snapshot.status === 'not-found'" class="resource-empty">empty</div>
      <div v-else class="resource-loading">loading</div>
    </section>
  `,
};

const BaseHashStub = {
  props: ['hash', 'link'],
  template: '<span class="base-hash-stub" :data-hash="hash" :data-link="link">{{ hash }}</span>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a class="base-link-stub" :data-to="to"><slot /></a>',
};

const BaseJsonStub = {
  props: ['value'],
  template: '<pre class="decoded-json">{{ JSON.stringify(value) }}</pre>',
};

const BaseButtonStub = {
  inheritAttrs: false,
  props: ['nativeType', 'disabled'],
  emits: ['click'],
  template: `
    <button
      v-bind="$attrs"
      :type="nativeType || 'button'"
      :disabled="disabled"
      @click="$emit('click', $event)"
    ><slot /></button>
  `,
};

function emptyList() {
  return { status: 'ok', data: { items: [], nextCursor: null } };
}

function contractEvent() {
  return {
    event_id: `${eventTransactionHash}:0`,
    schema_version: 1,
    provenance: 'emitted',
    authority: accountId,
    timestamp_ms: 1_750_000_000_000,
    execution_hash_hex: eventTransactionHash,
    block_height: 77,
    block_hash_hex: eventBlockHash,
    result_ok: true,
    contract_address: contractAddress,
    event_kind: 'swap_filled',
    participants: [accountId],
    asset_ids: ['usd#issuer.main'],
    numeric_fields: { amount_in: 10 },
    payload: { amount_out: 9 },
  };
}

beforeEach(() => {
  apiState.activity = emptyList();
  apiState.events = emptyList();
  apiState.streamImplementation = () => (async function* () {})();
  for (const mock of Object.values(apiMocks)) mock.mockClear();
});

async function factory(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/contracts', component: SmartContractsPage }],
  });
  await router.push({ path: '/contracts', query });
  await router.isReady();
  const wrapper = mount(SmartContractsPage, {
    global: {
      plugins: [router, i18n],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseHash: BaseHashStub,
        BaseJson: BaseJsonStub,
        BaseLink: BaseLinkStub,
        BaseResourceState: BaseResourceStateStub,
        BaseTable: BaseTableStub,
        BaseTabs: BaseTabsStub,
      },
    },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('SmartContractsPage route-backed views', () => {
  it('writes the selected tab and canonical activity filters into the URL', async () => {
    const { wrapper, router } = await factory({ tab: 'events' });
    await wrapper.get('.tab-activity').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBeUndefined();
    await wrapper.get('input[name="authority"]').setValue(accountId);
    await wrapper.get('input[name="contract_entrypoint"]').setValue('swap');
    await wrapper.get('select[name="result_ok"]').setValue('false');
    await wrapper.get('[data-test="contract-filters"]').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.query).toMatchObject({
      authority: accountId,
      contract_entrypoint: 'swap',
      result_ok: 'false',
    });
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(apiMocks.fetchContractActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: null,
        limit: 10,
        authority: accountId,
        contract_entrypoint: 'swap',
        result_ok: false,
      })
    );
  });

  it('renders decoded activity payloads and transaction/account links', async () => {
    apiState.activity = {
      status: 'ok',
      data: {
        items: [
          {
            authority: accountId,
            timestamp_ms: 1_750_000_000_000,
            entrypoint_hash: activityHash,
            result_ok: true,
            contract_address: contractAddress,
            contract_alias: contractAlias,
            contract_entrypoint: 'swap',
            contract_payload: { amount_in: 10, minimum_out: 9 },
            fee_payment: { payer: 'authority' },
          },
        ],
        nextCursor: null,
      },
    };
    const { wrapper } = await factory({ tab: 'activity', contract_entrypoint: 'swap' });

    expect(wrapper.text()).toContain('View decoded data');
    expect(wrapper.text()).toContain('Contract payload');
    expect(
      wrapper
        .findAll('.decoded-json')
        .map((node) => node.text())
        .join(' ')
    ).toContain('minimum_out');
    expect(wrapper.get(`[data-hash="${activityHash}"]`).attributes('data-link')).toBe(`/transactions/${activityHash}`);
    expect(wrapper.get('[data-hash="' + accountId + '"]').attributes('data-link')).toBe(
      `/accounts/${encodeURIComponent(accountId)}`
    );
  });

  it('shows malformed bookmarked filters as an explicit error without calling Torii', async () => {
    const { wrapper } = await factory({ tab: 'activity', authority: ` ${accountId}` });

    expect(apiMocks.fetchContractActivity).not.toHaveBeenCalled();
    expect(wrapper.get('.resource-error').text()).toBe(
      'Invalid contract filters: authority must be non-empty and contain no surrounding whitespace'
    );
    expect(wrapper.get('.resource-state').attributes('data-status')).toBe('error');
  });

  it('preserves exact form input and rejects surrounding whitespace instead of normalizing it', async () => {
    const { wrapper, router } = await factory();
    apiMocks.fetchContractActivity.mockClear();

    await wrapper.get('input[name="contract_entrypoint"]').setValue(' swap ');
    await wrapper.get('[data-test="contract-filters"]').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.query.contract_entrypoint).toBe(' swap ');
    expect(apiMocks.fetchContractActivity).not.toHaveBeenCalled();
    expect(wrapper.get('.resource-error').text()).toContain('surrounding whitespace');
  });

  it('rejects malformed pagination without opening a contract list request', async () => {
    const { wrapper } = await factory({ cursor: '', limit: '30' });

    expect(apiMocks.fetchContractActivity).not.toHaveBeenCalled();
    expect(wrapper.get('.resource-error').text()).toContain('cursor');
    expect(wrapper.get('.resource-retry').text()).toBe('Reset pagination');
  });

  it('retains a server continuation for an empty collection page', async () => {
    apiState.activity = {
      status: 'ok',
      data: { items: [], nextCursor: 'continue' },
    };

    const { wrapper } = await factory({ cursor: 'previous' });

    expect(wrapper.get('.resource-state').attributes('data-status')).toBe('ready');
    expect(wrapper.get('.table-stub').attributes('data-next-cursor')).toBe('continue');
  });

  it('localizes a successful transport response that is not a contract list', async () => {
    apiState.activity = { status: 'unexpected-response' };
    const { wrapper } = await factory({ tab: 'activity' });

    expect(wrapper.get('.resource-error').text()).toBe('Contract activity could not be loaded.');
    expect(wrapper.get('.resource-state').attributes('data-status')).toBe('error');
  });

  it('sends every event-history query filter and renders semantic event links', async () => {
    apiState.events = {
      status: 'ok',
      data: { items: [contractEvent()], nextCursor: null },
    };
    const { wrapper } = await factory({
      tab: 'events',
      event_kind: 'swap_filled',
      participant: accountId,
      asset_id: 'usd#issuer.main',
      provenance: 'emitted',
      result_ok: 'true',
      since_timestamp_ms: '100',
      until_timestamp_ms: '200',
    });

    expect(apiMocks.fetchContractEvents).toHaveBeenCalledWith(
      expect.objectContaining({
          event_kind: 'swap_filled',
        participant: accountId,
        asset_id: 'usd#issuer.main',
        provenance: 'emitted',
        result_ok: true,
        since_timestamp_ms: 100,
        until_timestamp_ms: 200,
      })
    );
    expect(wrapper.get(`[data-hash="${eventTransactionHash}"]`).attributes('data-link')).toBe(
      `/transactions/${eventTransactionHash}`
    );
    expect(wrapper.text()).toContain('swap_filled · Emitted');
    expect(
      wrapper.findAll('.base-link-stub').some((link) => link.attributes('data-to') === '/assets/usd%23issuer.main')
    ).toBe(true);
    expect(
      wrapper
        .findAll('.decoded-json')
        .map((node) => node.text())
        .join(' ')
    ).toContain('amount_out');
  });
});

describe('SmartContractsPage live events', () => {
  it('marks a typed gap stale and waits for an explicit history reload before opening another stream', async () => {
    apiState.events = {
      status: 'ok',
      data: { items: [contractEvent()], nextCursor: null },
    };
    apiState.streamImplementation = () =>
      (async function* () {
        yield* [];
        throw new ToriiStreamGapError('events were lost', {
          code: 'stream_lagged',
          droppedMessages: 4,
          replayAvailable: false,
        });
      })();
    const { wrapper } = await factory({ tab: 'events' });

    await wrapper.get('[data-test="start-contract-stream"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="contract-stream-stale"]').text()).toContain(
      'The live event stream stopped unexpectedly.'
    );
    expect(wrapper.get('[data-test="contract-stream-stale"]').text()).not.toContain('events were lost');
    expect(wrapper.get('[data-test="contract-stream-stale"]').text()).toContain('Dropped messages: 4');
    expect(wrapper.get('[data-test="contract-stream-stale"]').text()).toContain('will not reconnect automatically');
    expect(apiMocks.streamContractEvents).toHaveBeenCalledTimes(1);

    await flushPromises();
    expect(apiMocks.streamContractEvents).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-test="resync-contract-stream"]').trigger('click');
    await flushPromises();
    expect(apiMocks.fetchContractEvents).toHaveBeenCalledTimes(2);
    expect(apiMocks.streamContractEvents).toHaveBeenCalledTimes(2);
  });

  it('shows decoded live events and forwards an explicit stop to the AbortSignal', async () => {
    apiState.events = {
      status: 'ok',
      data: { items: [contractEvent()], nextCursor: null },
    };
    let observedSignal: AbortSignal | undefined;
    apiState.streamImplementation = (_filters, signal) =>
      (async function* () {
        observedSignal = signal;
        yield { event: 'contract_event', data: contractEvent(), id: `${eventTransactionHash}:0`, raw: '{}' };
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true });
        });
      })();
    const { wrapper } = await factory({ tab: 'events', event_kind: 'swap_filled' });

    await wrapper.get('[data-test="start-contract-stream"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('swap_filled');
    expect(wrapper.text()).toContain('Emitted · block 77');
    expect(wrapper.text()).toContain('1 event retained');

    await wrapper.get('[data-test="stop-contract-stream"]').trigger('click');
    await flushPromises();
    expect(observedSignal?.aborted).toBe(true);
    expect(wrapper.text()).toContain('Stream stopped by the user.');
    expect(wrapper.find('[data-test="contract-stream-stale"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
