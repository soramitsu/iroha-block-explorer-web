import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ToriiStreamGapError } from '@iroha/iroha-js/torii-browser';
import SmartContractsPage from './SmartContractsPage.vue';
import { i18n } from '@/shared/lib/localization';

const contractAddress = 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7';
const accountAlias = 'treasury@banking.retail';

const apiState = vi.hoisted(() => ({
  instructions: null as any,
  activity: null as any,
  events: null as any,
  streamImplementation: (() => (async function* () {})()) as (
    filters: Record<string, unknown>,
    signal?: AbortSignal
  ) => AsyncGenerator<any, void, unknown>,
}));

const apiMocks = vi.hoisted(() => ({
  fetchInstructions: vi.fn(async () => apiState.instructions),
  fetchContractActivity: vi.fn(async () => apiState.activity),
  fetchContractEvents: vi.fn(async () => apiState.events),
  streamContractEvents: vi.fn((filters: Record<string, unknown>, signal?: AbortSignal) =>
    apiState.streamImplementation(filters, signal)
  ),
}));

vi.mock('@/shared/api', () => apiMocks);

const navigationPushSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({ push: navigationPushSpy }),
  useCurrentExplorerScope: () => ({ value: null }),
}));

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
  props: ['items'],
  emits: ['click:row', 'update:cursor', 'update:pageSize'],
  template: `
    <div class="table-stub">
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
  props: ['snapshot', 'retryLabel'],
  emits: ['retry'],
  template: `
    <section class="resource-state" :data-status="snapshot.status">
      <slot v-if="snapshot.status === 'ready'" :data="snapshot.data" />
      <template v-else-if="snapshot.status === 'error'">
        <div class="resource-error"><slot name="error" :problem="snapshot.problem">{{ snapshot.problem.message }}</slot></div>
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

function deploymentInstruction(hash = '0xdeploy') {
  return {
    authority: accountAlias,
    created_at: new Date('2026-04-04T00:00:00Z'),
    kind: 'ActivateContractInstance',
    index: 3,
    transaction_hash: hash,
    transaction_status: 'Committed',
    block: 101,
    box: {
      encoded: '0x01',
      json: {
        kind: 'ActivateContractInstance',
        payload: {
          contract_address: contractAddress,
          contract_alias: 'router',
          code_hash: 'aa'.repeat(32),
        },
      },
    },
  };
}

function contractEvent() {
  return {
    event_id: '0xevent:0',
    schema_version: 1,
    provenance: 'derived',
    authority: accountAlias,
    timestamp_ms: 1_750_000_000_000,
    tx_hash_hex: '0xevent',
    block_height: 77,
    block_hash_hex: '0xblock',
    result_ok: true,
    contract_address: contractAddress,
    contract_alias: 'router',
    module: 'router',
    event_kind: 'swap_filled',
    participants: [accountAlias],
    asset_ids: ['usd#issuer.main'],
    numeric_fields: { amount_in: 10 },
    payload: { amount_out: 9 },
  };
}

beforeEach(() => {
  apiState.instructions = {
    status: 'ok',
    data: {
      nextCursor: null,
      items: [deploymentInstruction()],
    },
  };
  apiState.activity = emptyList();
  apiState.events = emptyList();
  apiState.streamImplementation = () => (async function* () {})();
  for (const mock of Object.values(apiMocks)) mock.mockClear();
  navigationPushSpy.mockClear();
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

describe('SmartContractsPage deployments', () => {
  it('renders deployments with semantic links and opens the transaction row', async () => {
    const { wrapper } = await factory();

    expect(wrapper.get('[data-hash="' + contractAddress + '"]').text()).toBe(contractAddress);
    expect(wrapper.get('[data-hash="' + accountAlias + '"]').attributes('data-link'))
      .toBe('/accounts/treasury%40banking.retail');
    expect(wrapper.get('[data-hash="0xdeploy"]').attributes('data-link')).toBe('/transactions/0xdeploy');
    expect(wrapper.get('.base-link-stub').attributes('data-to')).toBe('/blocks/101');

    await wrapper.get('.row-button').trigger('click');
    expect(navigationPushSpy).toHaveBeenCalledWith('/transactions/0xdeploy');
  });
});

describe('SmartContractsPage route-backed views', () => {
  it('writes the selected tab and canonical activity filters into the URL', async () => {
    const { wrapper, router } = await factory();
    await wrapper.get('.tab-activity').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBe('activity');
    await wrapper.get('input[name="authority"]').setValue(` ${accountAlias} `);
    await wrapper.get('input[name="contract_entrypoint"]').setValue(' swap ');
    await wrapper.get('select[name="result_ok"]').setValue('false');
    await wrapper.get('[data-test="contract-filters"]').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.query).toMatchObject({
      tab: 'activity',
      authority: accountAlias,
      contract_entrypoint: 'swap',
      result_ok: 'false',
    });
    expect(apiMocks.fetchContractActivity).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: null, limit: 10,
      authority: accountAlias,
      contract_entrypoint: 'swap',
      result_ok: false,
    }));
  });

  it('renders decoded activity payloads and transaction/account links', async () => {
    apiState.activity = {
      status: 'ok',
      data: {
        items: [{
          authority: accountAlias,
          timestamp_ms: 1_750_000_000_000,
          entrypoint_hash: '0xcall',
          result_ok: true,
          contract_address: contractAddress,
          contract_alias: 'router',
          contract_entrypoint: 'swap',
          contract_payload: { amount_in: 10, minimum_out: 9 },
          fee_payment: { payer: 'authority' },
        }],
        nextCursor: null,
      },
    };
    const { wrapper } = await factory({ tab: 'activity', contract_entrypoint: 'swap' });

    expect(wrapper.text()).toContain('View decoded data');
    expect(wrapper.text()).toContain('Contract payload');
    expect(wrapper.findAll('.decoded-json').map((node) => node.text()).join(' ')).toContain('minimum_out');
    expect(wrapper.get('[data-hash="0xcall"]').attributes('data-link')).toBe('/transactions/0xcall');
    expect(wrapper.get('[data-hash="' + accountAlias + '"]').attributes('data-link'))
      .toBe('/accounts/treasury%40banking.retail');
  });

  it('shows malformed bookmarked filters as an explicit error without calling Torii', async () => {
    const { wrapper } = await factory({ tab: 'activity', authority: ` ${accountAlias}` });

    expect(apiMocks.fetchContractActivity).not.toHaveBeenCalled();
    expect(wrapper.get('.resource-error').text()).toContain('authority must be non-empty');
    expect(wrapper.get('.resource-state').attributes('data-status')).toBe('error');
  });

  it('sends every event-history query filter and renders semantic event links', async () => {
    apiState.events = {
      status: 'ok',
      data: { items: [contractEvent()], nextCursor: null },
    };
    const { wrapper } = await factory({
      tab: 'events',
      module: 'router',
      event_kind: 'swap_filled',
      participant: accountAlias,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      result_ok: 'true',
      since_timestamp_ms: '100',
      until_timestamp_ms: '200',
    });

    expect(apiMocks.fetchContractEvents).toHaveBeenCalledWith(expect.objectContaining({
      module: 'router',
      event_kind: 'swap_filled',
      participant: accountAlias,
      asset_id: 'usd#issuer.main',
      provenance: 'derived',
      result_ok: true,
      since_timestamp_ms: 100,
      until_timestamp_ms: 200,
    }));
    expect(wrapper.get('[data-hash="0xevent"]').attributes('data-link')).toBe('/transactions/0xevent');
    expect(wrapper.findAll('.base-link-stub').some((link) =>
      link.attributes('data-to') === '/assets/usd%23issuer.main'
    )).toBe(true);
    expect(wrapper.findAll('.decoded-json').map((node) => node.text()).join(' ')).toContain('amount_out');
  });
});

describe('SmartContractsPage live events', () => {
  it('marks a typed gap stale and waits for an explicit history reload before opening another stream', async () => {
    apiState.events = {
      status: 'ok',
      data: { items: [contractEvent()], nextCursor: null },
    };
    apiState.streamImplementation = () => (async function* () {
      yield* [];
      throw new ToriiStreamGapError('events were lost', {
        code: 'stream_lagged',
        droppedMessages: 4,
        replayAvailable: false,
      });
    })();
    const { wrapper } = await factory({ tab: 'events', module: 'router' });

    await wrapper.get('[data-test="start-contract-stream"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="contract-stream-stale"]').text()).toContain('events were lost');
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
    apiState.streamImplementation = (_filters, signal) => (async function* () {
      observedSignal = signal;
      yield { event: 'contract_event', data: contractEvent(), id: '0xevent:0', raw: '{}' };
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true });
      });
    })();
    const { wrapper } = await factory({ tab: 'events', event_kind: 'swap_filled' });

    await wrapper.get('[data-test="start-contract-stream"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('router · swap_filled');
    expect(wrapper.text()).toContain('1 event retained');

    await wrapper.get('[data-test="stop-contract-stream"]').trigger('click');
    await flushPromises();
    expect(observedSignal?.aborted).toBe(true);
    expect(wrapper.text()).toContain('Stream stopped by the user.');
    expect(wrapper.find('[data-test="contract-stream-stale"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
