import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DataspaceDetails from './DataspaceDetails.vue';
import { i18n } from '@/shared/lib/localization';

const routeState = reactive({
  params: {
    laneId: '7',
    dataspaceId: '42',
  },
});

const pushSpy = vi.fn();

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<any>('vue-router');
  return {
    ...actual,
    useRoute: () => routeState,
  };
});

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    push: pushSpy,
  }),
}));

vi.mock('@/shared/api', () => ({
  getConfiguredToriiBaseUrl: vi.fn(() => 'https://registry.example:8080'),
  normalizeToriiBaseUrl: vi.fn((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (
        (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
      ) {
        return null;
      }
      return parsed.origin;
    } catch {
      return null;
    }
  }),
}));

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot name="header-action" /><slot /></section>',
};

const BaseButtonStub = {
  props: ['nativeType', 'disabled'],
  emits: ['click'],
  template:
    '<button :type="nativeType || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};

const DataFieldStub = {
  props: ['title', 'value'],
  template:
    '<div class="data-field"><span class="data-field__title">{{ title }}</span><span class="data-field__value">{{ value }}</span></div>',
};

describe('Dataspace details page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushSpy.mockReset();
    pushSpy.mockReturnValue(Promise.resolve());
    routeState.params.laneId = '7';
    routeState.params.dataspaceId = '42';
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  });

  const factory = () =>
    mount(DataspaceDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          DataField: DataFieldStub,
        },
      },
    });

  it('renders exact route identity while refusing to expose untyped diagnostics', () => {
    const wrapper = factory();

    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain('42');
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain('7');
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).not.toContain('Dataspace type');
    expect(wrapper.get('[data-test="dataspace-details-diagnostic-protected"]').text()).toContain('/status');
    expect(wrapper.get('[data-test="dataspace-details-governance-protected"]').text()).toContain(
      'OperatorSigningContext'
    );
  });

  it.each([
    ['-1', '42'],
    ['7.5', '42'],
    ['7', 'not-a-dataspace'],
  ])('rejects invalid route ids (%s, %s)', async (laneId, dataspaceId) => {
    routeState.params.laneId = laneId;
    routeState.params.dataspaceId = dataspaceId;
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="dataspace-details-error"]').text()).toContain('Invalid dataspace route parameters');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('adds and removes a saved public node without seeded deployment assumptions', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="dataspace-details-public-nodes-empty"]').text()).toContain('No public nodes saved');

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Public node A');
    await inputs[1].setValue('https://public-node-a.example:18080');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-test="dataspace-details-public-nodes"]').text()).toContain('Public node A');
    expect(wrapper.get('[data-test="dataspace-details-public-nodes"]').text()).toContain(
      'https://public-node-a.example:18080'
    );

    await wrapper.get('[data-test="dataspace-details-remove-node"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="dataspace-details-public-nodes-empty"]').text()).toContain('No public nodes saved');
  });

  it('opens the scoped explorer with the selected public node', async () => {
    const wrapper = factory();
    await flushPromises();

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Public node B');
    await inputs[1].setValue('https://public-node-b.example:18080');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    await wrapper.get('[data-test="dataspace-details-open-scoped"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/blocks',
      query: {
        torii: 'https://public-node-b.example:18080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
    });
  });
});
