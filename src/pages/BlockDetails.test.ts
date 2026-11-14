import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import BlockDetails from './BlockDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const route = ref({ params: { heightOrHash: '42' } });
const push = vi.fn().mockResolvedValue(undefined);
const refetch = vi.fn();
const expose = ref<any>();
const scopeParamSpy = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: route }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: (param: { value: unknown }) => {
    scopeParamSpy(param.value);
    return ref({ expose: expose.value });
  },
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => ref(null),
  useScopedExplorerNavigation: () => ({ push }),
}));

vi.mock('@/shared/ui/composables/useTelemetryMetrics', () => ({
  useTelemetryMetrics: () => ({ metrics: ref({ block: 100 }) }),
}));

vi.mock('@/shared/ui/composables/useAdaptiveHash', () => ({
  useAdaptiveHash: () => 'short',
}));

const block = {
  hash: 'hash:block',
  height: 42,
  created_at: new Date('2026-07-21T00:00:00Z'),
  prev_block_hash: 'hash:parent',
  transactions_hash: 'hash:transactions',
  transactions_rejected: 0,
  transactions_total: 1,
};

function mountPage() {
  return mount(BlockDetails, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: { template: '<section><slot name="header"/><slot /></section>' },
        DataField: { props: ['title', 'value', 'hash'], template: '<div>{{ title }} {{ value ?? hash }}</div>' },
        TransactionsTable: { template: '<div data-test="transactions-table" />' },
        ArrowIcon: { template: '<svg />' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('BlockDetails resource states', () => {
  beforeEach(() => {
    push.mockClear();
    refetch.mockClear();
    scopeParamSpy.mockClear();
    route.value = { params: { heightOrHash: '42' } };
    expose.value = {
      isLoading: false,
      data: { status: SUCCESSFUL_FETCHING, data: block },
      snapshot: {
        status: 'ready',
        data: { status: SUCCESSFUL_FETCHING, data: block },
        isRefreshing: false,
        refreshError: null,
      },
      refetch,
    };
  });

  it('uses native previous/next controls and keeps scoped navigation exact', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="prevBlock"]').element.tagName).toBe('BUTTON');
    expect(wrapper.get('[data-testid="nextBlock"]').attributes('aria-label')).toBe('Next block');
    await wrapper.get('[data-testid="nextBlock"]').trigger('click');
    expect(push).toHaveBeenCalledWith({
      name: 'blocks-details',
      params: { heightOrHash: 43 },
    });
  });

  it('passes the exact route selector to the strict API boundary without numeric coercion', () => {
    route.value = { params: { heightOrHash: '042' } };

    mountPage();

    expect(scopeParamSpy).toHaveBeenCalledWith('042');
    expect(scopeParamSpy).not.toHaveBeenCalledWith(42);
  });

  it('renders not-found explicitly instead of a blank detail page', async () => {
    expose.value = {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch,
    };
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('This block is not available yet in explorer');
    expect(wrapper.find('[data-test="transactions-table"]').exists()).toBe(false);
  });

  it('renders a retryable terminal error without issuing a hidden retry', async () => {
    expose.value = {
      isLoading: false,
      data: undefined,
      snapshot: {
        status: 'error',
        problem: { kind: 'network', message: 'offline' },
      },
      refetch,
    };
    const wrapper = mountPage();
    await flushPromises();

    expect(refetch).not.toHaveBeenCalled();
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders a hash-only committed-journal record as body-unavailable rather than an empty block', async () => {
    const hashOnlyBlock = {
      ...block,
      created_at: null,
      transactions_hash: null,
      transactions_rejected: 0,
      transactions_total: 0,
    };
    expose.value = {
      isLoading: false,
      data: { status: SUCCESSFUL_FETCHING, data: hashOnlyBlock },
      snapshot: { status: 'ready', data: { status: SUCCESSFUL_FETCHING, data: hashOnlyBlock } },
      refetch,
    };

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-test="block-created-at"]').text()).toContain(
      i18n.global.t('telemetry.dataUnknown')
    );
    expect(wrapper.find('[data-test="block-body-unavailable"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="block-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="transactions-table"]').exists()).toBe(false);
  });
});
