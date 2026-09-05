import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import AssetDetails from './AssetDetails.vue';
import { i18n } from '@/shared/lib/localization';
import * as http from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';

const SAMPLE_ACCOUNT_ID = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_ALIAS = 'USD#Issuer.Main';

const routeState = ref({
  params: { id: SAMPLE_ASSET_ALIAS },
});

const setupStateQueue = vi.hoisted((): any[] => []);
const assetDetailsStates = vi.hoisted((): any => {
  const definition = {
    id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
    owning_domain: 'issuer.main',
    alias: 'USD#Issuer.Main',
    alias_binding: {
      alias: 'USD#Issuer.Main',
      status: 'leased_grace',
      lease_expiry_ms: 1_700_000_000_000,
      grace_until_ms: 1_700_086_400_000,
      bound_at_ms: 0,
    },
    balance_scope_policy: 'DataspaceRestricted',
    confidential_policy: {
      mode: 'Convertible',
      vk_set_hash: '0123456789abcdef',
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: null,
    },
    name: 'USD',
    description: 'United States dollar',
    owned_by: 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE',
    mintable: 'Limited(42)',
    logo: 'sorafs://asset-logo',
    metadata: { ticker: 'USD' },
    spec: { scale: 18 },
    total_quantity: '123456789012345678901234567890.123456789',
  };
  const confidentialPolicy = {
    asset_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
    block_height: '1050',
    current_mode: 'Convertible',
    effective_mode: 'Convertible',
    vk_set_hash: 'AB'.repeat(32),
    poseidon_params_id: 7,
    pedersen_params_id: 11,
    pending_transition: {
      transition_id: 'CD'.repeat(32),
      previous_mode: 'Convertible',
      new_mode: 'ShieldedOnly',
      effective_height: '1200',
      conversion_window: '200',
      window_open_height: '1000',
    },
  };

  return {
    definition,
    confidentialPolicy,
    asset: {
      isLoading: false,
      data: {
        status: 'ok',
        data: structuredClone(definition),
      },
      refetch: vi.fn(),
    },
    transitions: {
      isLoading: false,
      data: {
        status: 'ok',
        data: structuredClone(confidentialPolicy),
      },
      refetch: vi.fn(),
    },
    assets: {
      isLoading: false,
      data: {
        status: 'ok',
        data: {
          pagination: { limit: 10, next_cursor: null, has_more: false },
          items: [],
        },
      },
      refetch: vi.fn(),
    },
  };
});

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: routeState,
  }),
}));

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => setupStateQueue.shift() ?? assetDetailsStates.assets),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<div><slot name="header-action" /><slot /></div>',
};

const BaseTableStub = {
  props: ['items'],
  template: '<div><slot name="header" /><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseHashStub = {
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const BaseLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

const BaseButtonStub = {
  props: ['to'],
  template: '<button><slot /></button>',
};

function encodeDataFieldValue(value: unknown): string {
  if (value === null) return '__NULL__';
  if (value === undefined) return '__UNDEFINED__';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const DataFieldStub = {
  props: ['title', 'value', 'link', 'monospace'],
  methods: { encodeDataFieldValue },
  template:
    '<div data-test="data-field" :data-title="title" :data-value="encodeDataFieldValue(value)" :data-link="link" :data-monospace="monospace" />',
};

describe('AssetDetails', () => {
  beforeEach(() => {
    routeState.value = {
      params: { id: SAMPLE_ASSET_ALIAS },
    };
    vi.mocked(setupAsyncData).mockClear();
    setupStateQueue.splice(0);
    assetDetailsStates.asset.data.data = structuredClone(assetDetailsStates.definition);
    assetDetailsStates.transitions.data.data = structuredClone(assetDetailsStates.confidentialPolicy);
    assetDetailsStates.assets.data.data.items = [];
    assetDetailsStates.assets.data.data.pagination = { limit: 10, next_cursor: null, has_more: false };
    assetDetailsStates.asset.snapshot = {
      status: 'ready',
      data: assetDetailsStates.asset.data,
      isRefreshing: false,
      refreshError: null,
    };
    assetDetailsStates.transitions.snapshot = {
      status: 'ready',
      data: assetDetailsStates.transitions.data,
      isRefreshing: false,
      refreshError: null,
    };
    setupStateQueue.push(assetDetailsStates.asset, assetDetailsStates.transitions, assetDetailsStates.assets);
  });

  const factory = () =>
    mount(AssetDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseButton: BaseButtonStub,
          BaseContentBlock: BaseContentBlockStub,
          BaseHash: BaseHashStub,
          BaseLink: BaseLinkStub,
          BaseLoading: true,
          BaseTable: BaseTableStub,
          DataField: DataFieldStub,
        },
      },
    });

  const fieldValue = (wrapper: ReturnType<typeof factory>, translationKey: string) => {
    const field = wrapper
      .findAll('[data-test="data-field"]')
      .find((candidate) => candidate.attributes('data-title') === i18n.global.t(translationKey));

    expect(field, `missing field ${translationKey}`).toBeDefined();
    return field?.attributes('data-value');
  };

  it('renders every current asset-definition field without normalizing exact values', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(fieldValue(wrapper, 'assets.definitionFields.name')).toBe('USD');
    expect(fieldValue(wrapper, 'assets.definitionFields.description')).toBe('United States dollar');
    expect(fieldValue(wrapper, 'assets.definitionFields.alias')).toBe('USD#Issuer.Main');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasStatus')).toBe('leased_grace');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasLeaseExpiry')).toBe('2023-11-14T22:13:20.000Z');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasGraceUntil')).toBe('2023-11-15T22:13:20.000Z');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasBoundAt')).toBe('1970-01-01T00:00:00.000Z');
    expect(fieldValue(wrapper, 'assets.definitionFields.balanceScopePolicy')).toBe('DataspaceRestricted');
    expect(fieldValue(wrapper, 'assets.definitionFields.confidentialPolicy')).toBe(
      JSON.stringify(assetDetailsStates.definition.confidential_policy)
    );
    expect(fieldValue(wrapper, 'assets.definitionFields.logo')).toBe('sorafs://asset-logo');
    expect(fieldValue(wrapper, 'assets.definitionFields.numericSpec')).toBe('{"scale":18}');
    expect(fieldValue(wrapper, 'assets.definitionFields.totalQuantity')).toBe(
      '123456789012345678901234567890.123456789'
    );
    expect(fieldValue(wrapper, 'mintable')).toBe('Limited(42)');
    expect(fieldValue(wrapper, 'metadata')).toBe(JSON.stringify({ ticker: 'USD' }));
  });

  it('keeps nullable definition fields distinct from absent alias-binding data', async () => {
    assetDetailsStates.asset.data.data.alias = null;
    assetDetailsStates.asset.data.data.description = null;
    assetDetailsStates.asset.data.data.logo = null;
    delete assetDetailsStates.asset.data.data.alias_binding;

    const wrapper = factory();
    await flushPromises();

    expect(fieldValue(wrapper, 'assets.definitionFields.alias')).toBe('__NULL__');
    expect(fieldValue(wrapper, 'assets.definitionFields.description')).toBe('__NULL__');
    expect(fieldValue(wrapper, 'assets.definitionFields.logo')).toBe('__NULL__');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasStatus')).toBe('—');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasLeaseExpiry')).toBe('—');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasGraceUntil')).toBe('—');
    expect(fieldValue(wrapper, 'assets.definitionFields.aliasBoundAt')).toBe('—');
  });

  it('renders the authoritative confidential transition policy without rewriting its exact DTO values', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="confidential-asset-policy"]').exists()).toBe(true);
    expect(fieldValue(wrapper, 'id')).toBe(assetDetailsStates.confidentialPolicy.asset_id);
    expect(fieldValue(wrapper, 'blocks.height')).toBe('1050');
    expect(fieldValue(wrapper, 'studio.graph.fields.mode')).toBe(
      JSON.stringify({ current_mode: 'Convertible', effective_mode: 'Convertible' })
    );
    expect(fieldValue(wrapper, 'zkRegistry.columns.verifyingKey')).toBe('AB'.repeat(32));
    expect(fieldValue(wrapper, 'studio.graph.fields.parameters')).toBe(
      JSON.stringify({ poseidon_params_id: 7, pedersen_params_id: 11 })
    );
    expect(fieldValue(wrapper, 'sorafs.manifestStatus.pending')).toBe(
      JSON.stringify(assetDetailsStates.confidentialPolicy.pending_transition)
    );
  });

  it('shows an exact null pending transition instead of inventing transition data', async () => {
    assetDetailsStates.transitions.data.data.pending_transition = null;

    const wrapper = factory();
    await flushPromises();

    expect(fieldValue(wrapper, 'sorafs.manifestStatus.pending')).toBe('null');
  });

  it('preserves an out-of-range valid millisecond timestamp instead of throwing', async () => {
    assetDetailsStates.asset.data.data.alias_binding.lease_expiry_ms = Number.MAX_SAFE_INTEGER;

    const wrapper = factory();
    await flushPromises();

    expect(fieldValue(wrapper, 'assets.definitionFields.aliasLeaseExpiry')).toBe(
      i18n.global.t('units.milliseconds', { value: Number.MAX_SAFE_INTEGER })
    );
  });

  it('shows an error for invalid holder filters', async () => {
    assetDetailsStates.assets.data.data.items = [
      {
        id: `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${SAMPLE_ACCOUNT_ID}`,
        definition_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        account_id: SAMPLE_ACCOUNT_ID,
        value: '11',
      },
    ];
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    expect(wrapper.text()).toContain(SAMPLE_ACCOUNT_ID);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));
    expect(wrapper.text()).not.toContain(SAMPLE_ACCOUNT_ID);
  });

  it('preserves an exact mixed-case alias from the route through the detail request', async () => {
    const detailSpy = vi.spyOn(http, 'fetchAssetDefinition').mockResolvedValue(assetDetailsStates.asset.data);

    const wrapper = factory();
    const detailLoader = vi.mocked(setupAsyncData).mock.calls[0]?.[0];
    expect(detailLoader).toBeTypeOf('function');
    await detailLoader?.();

    expect(detailSpy).toHaveBeenCalledWith(SAMPLE_ASSET_ALIAS);
    wrapper.unmount();
    detailSpy.mockRestore();
  });

  it('loads confidential transitions only after resolving the route alias to a canonical definition id', async () => {
    const transitionSpy = vi
      .spyOn(http, 'fetchConfidentialAssetTransitions')
      .mockResolvedValue(assetDetailsStates.transitions.data);

    const wrapper = factory();
    const transitionLoader = vi.mocked(setupAsyncData).mock.calls[1]?.[0];
    expect(transitionLoader).toBeTypeOf('function');
    await transitionLoader?.();

    expect(transitionSpy).toHaveBeenCalledWith(assetDetailsStates.definition.id);
    expect(transitionSpy).not.toHaveBeenCalledWith(SAMPLE_ASSET_ALIAS);
    wrapper.unmount();
    transitionSpy.mockRestore();
  });

  it('renders the zero-holder state from a terminal empty first cursor page', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('assets.assetDoesntContainAnyInstances'));
  });

  it('does not claim zero holders while Torii exposes a continuation cursor', async () => {
    assetDetailsStates.assets.data.data.pagination = {
      limit: 10,
      next_cursor: 'holder_cursor_2',
      has_more: true,
    };
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('assets.assetDoesntContainAnyInstances'));
  });

  it('clears the holder filter error after a valid account id is entered', async () => {
    const wrapper = factory();
    const holderFilter = wrapper.get(`input[placeholder="${i18n.global.t('assets.filters.holderPlaceholder')}"]`);

    await holderFilter.setValue('not-a-valid-holder');
    await flushPromises();
    expect(wrapper.text()).toContain(i18n.global.t('searchUnsupported'));

    await holderFilter.setValue(SAMPLE_ACCOUNT_ID);
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('searchUnsupported'));
  });

  it('displays the authoritative owning domain for an opaque asset-definition id', async () => {
    assetDetailsStates.assets.data.data.items = [
      {
        id: `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${SAMPLE_ACCOUNT_ID}`,
        definition_id: '66owaQmAQMuHxPzxUN3bqZ6FJfDa',
        account_id: SAMPLE_ACCOUNT_ID,
        value: '11',
      },
    ];
    const wrapper = factory();
    await flushPromises();

    const domainField = wrapper
      .findAll('[data-test="data-field"]')
      .find((field) => field.attributes('data-title') === i18n.global.t('domain'));
    expect(domainField?.attributes('data-value')).toBe('issuer.main');
    expect(domainField?.attributes('data-link')).toBe('/domains/issuer.main');
    expect(wrapper.get('a[href="/domains/issuer.main"]').text()).toBe('issuer.main');
  });

  it('labels holder rows with definition_id instead of the enclosing asset instance id', async () => {
    const definitionId = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
    const instanceId = `${definitionId}#${SAMPLE_ACCOUNT_ID}`;
    assetDetailsStates.assets.data.data.items = [
      {
        id: instanceId,
        definition_id: definitionId,
        account_id: SAMPLE_ACCOUNT_ID,
        value: '11',
      },
    ];

    const wrapper = factory();
    await flushPromises();

    const definitionLink = wrapper.get(`a[href="/assets/${definitionId}"]`);
    expect(definitionLink.text()).toBe(definitionId);
    expect(definitionLink.text()).not.toBe(instanceId);
  });

  it('renders an explicit not-found state and hides the holder controls', async () => {
    setupStateQueue.splice(0, setupStateQueue.length, {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch: vi.fn(),
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Asset definition not found');
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('does not retry a terminal error until the user activates retry', async () => {
    const refetch = vi.fn();
    setupStateQueue.splice(0, setupStateQueue.length, {
      isLoading: false,
      data: undefined,
      snapshot: {
        status: 'error',
        problem: { kind: 'network', message: 'offline' },
      },
      refetch,
    });

    const wrapper = factory();
    await flushPromises();

    expect(refetch).not.toHaveBeenCalled();
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
