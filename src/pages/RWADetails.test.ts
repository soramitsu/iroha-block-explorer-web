import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import RWADetails from './RWADetails.vue';
import { i18n } from '@/shared/lib/localization';

const routeState = ref({
  params: { id: 'lot-001$commodities' },
});
const SAMPLE_ACCOUNT_ID =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

const scopeExpose = ref<any>({
  isLoading: false,
  data: undefined,
  refetch: vi.fn(),
});

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: routeState,
  }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () =>
    ref({
      expose: scopeExpose.value,
    }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><h1>{{ title }}</h1><slot /></div>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
};

const DataFieldStub = {
  props: ['title', 'value', 'hash'],
  template: '<div class="data-field-stub">{{ title }} {{ value ?? hash }}</div>',
};

describe('RWADetails', () => {
  beforeEach(() => {
    routeState.value = { params: { id: 'lot-001$commodities' } };
    scopeExpose.value = {
      isLoading: false,
      data: {
        root: {
          id: 'lot-001$commodities',
          owned_by: SAMPLE_ACCOUNT_ID,
          quantity: { toString: () => '42', minus: () => ({ toString: () => '40' }) },
          held_quantity: { toString: () => '2' },
          primary_reference: 'vault://receipts/2',
          status: null,
          is_frozen: true,
          metadata: {},
          parents: [{ rwa: 'parent-001$commodities', quantity: { toString: () => '40' } }],
        },
        missingAncestorIds: [],
        truncated: false,
        graph: {
          width: 600,
          height: 300,
          nodeWidth: 272,
          nodeHeight: 132,
          edges: [
            {
              id: 'parent-001$commodities->lot-001$commodities:40',
              source: 'parent-001$commodities',
              target: 'lot-001$commodities',
              quantity: '40',
            },
          ],
          nodes: [
            {
              id: 'parent-001$commodities',
              rwa: {
                id: 'parent-001$commodities',
                owned_by: SAMPLE_ACCOUNT_ID,
                quantity: { toString: () => '40', minus: () => ({ toString: () => '40' }) },
                held_quantity: { toString: () => '0' },
                primary_reference: 'vault://receipts/1',
                status: 'vaulted',
                is_frozen: false,
                metadata: {},
                parents: [],
              },
              depth: 1,
              column: 0,
              row: 0,
              x: 0,
              y: 0,
              isRoot: false,
              isPlaceholder: false,
            },
            {
              id: 'lot-001$commodities',
              rwa: {
                id: 'lot-001$commodities',
                owned_by: SAMPLE_ACCOUNT_ID,
                quantity: { toString: () => '42', minus: () => ({ toString: () => '40' }) },
                held_quantity: { toString: () => '2' },
                primary_reference: 'vault://receipts/2',
                status: null,
                is_frozen: true,
                metadata: {},
                parents: [{ rwa: 'parent-001$commodities', quantity: { toString: () => '40' } }],
              },
              depth: 0,
              column: 1,
              row: 0,
              x: 320,
              y: 0,
              isRoot: true,
              isPlaceholder: false,
            },
          ],
        },
      },
      refetch: vi.fn(),
    };
  });

  it('renders rwa detail fields', async () => {
    const wrapper = mount(RWADetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('RWA lot-001$commodities');
    expect(wrapper.text()).toContain('vault://receipts/2');
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('40');
    expect(wrapper.text()).toContain('Yes');
    expect(wrapper.text()).toContain('Provenance graph');
    expect(wrapper.text()).toContain('parent-001$commodities');
    expect(wrapper.text()).toContain('Parent contribution');
  });

  it('shows the origin note when the lot has no recorded parents', async () => {
    scopeExpose.value = {
      isLoading: false,
      data: {
        root: {
          id: 'lot-001$commodities',
          owned_by: SAMPLE_ACCOUNT_ID,
          quantity: { toString: () => '42', minus: () => ({ toString: () => '42' }) },
          held_quantity: { toString: () => '0' },
          primary_reference: 'vault://receipts/2',
          status: null,
          is_frozen: false,
          metadata: {},
          parents: [],
        },
        missingAncestorIds: [],
        truncated: false,
        graph: {
          width: 272,
          height: 132,
          nodeWidth: 272,
          nodeHeight: 132,
          edges: [],
          nodes: [
            {
              id: 'lot-001$commodities',
              rwa: {
                id: 'lot-001$commodities',
                owned_by: SAMPLE_ACCOUNT_ID,
                quantity: { toString: () => '42', minus: () => ({ toString: () => '42' }) },
                held_quantity: { toString: () => '0' },
                primary_reference: 'vault://receipts/2',
                status: null,
                is_frozen: false,
                metadata: {},
                parents: [],
              },
              depth: 0,
              column: 0,
              row: 0,
              x: 0,
              y: 0,
              isRoot: true,
              isPlaceholder: false,
            },
          ],
        },
      },
      refetch: vi.fn(),
    };

    const wrapper = mount(RWADetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          DataField: DataFieldStub,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('This lot has no recorded parent provenance.');
  });
});
