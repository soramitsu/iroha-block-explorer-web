import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DataspaceDetails from './DataspaceDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

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
  fetchNexusPublicStatus: vi.fn(),
  fetchSumeragiStatus: vi.fn(),
  getConfiguredToriiBaseUrl: vi.fn(() => 'https://registry.example:8080'),
  normalizeToriiBaseUrl: vi.fn((raw: string, fallback: string | null = null) => {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = new URL(trimmed.replace(/\/v[12]\/explorer$/i, '').replace(/\/+$/, ''));
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    } catch {
      return fallback;
    }
  }),
}));

import * as api from '@/shared/api';

const nexusStatusPayload = {
  blocks: 12,
  txs_approved: 20,
  txs_rejected: 1,
  queue_size: 3,
  dataspace_catalog: [{ lane_id: 7, dataspace_id: '42', alias: 'lane-seven', visibility: 'restricted', manifest_required: true, manifest_ready: true, manifest_path: '/manifests/lane7.json' }],
  teu_dataspace_backlog: [
    {
      lane_id: 7,
      dataspace_id: '42',
      fault_tolerance: 2,
      backlog: 9,
      age_slots: 6,
      virtual_finish: 11,
      tx_served: 88,
      alias: 'lane-seven',
      description: 'Lane seven dataspace',
    },
  ],
};

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

const BaseLoadingStub = {
  template: '<div>loading...</div>',
};

const DataFieldStub = {
  props: ['title', 'value'],
  template:
    '<div class="data-field"><span class="data-field__title">{{ title }}</span><span class="data-field__value">{{ value }}</span></div>',
};

describe('Dataspace details page', () => {
  beforeEach(() => {
    routeState.params.laneId = '7';
    routeState.params.dataspaceId = '42';
    vi.clearAllMocks();
    pushSpy.mockReset();
    pushSpy.mockReturnValue(Promise.resolve());
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }

    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: nexusStatusPayload,
    });

  });

  const factory = () =>
    mount(DataspaceDetails, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseLoading: BaseLoadingStub,
          DataField: DataFieldStub,
        },
      },
    });

  it('renders exact public catalog policy without operator telemetry', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(api.fetchNexusPublicStatus).toHaveBeenCalledTimes(1);
    expect(api.fetchSumeragiStatus).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain('lane-seven (#42)');
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain('restricted');
    expect(wrapper.text()).not.toContain(i18n.global.t('dataspaces.quorum'));
    expect(wrapper.text()).not.toContain(i18n.global.t('dataspaces.validators'));
    expect(wrapper.find('[data-test="dataspace-details-governance-error"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="dataspace-details-governance"]').text()).toContain('/manifests/lane7.json');
  });

  it.each([
    [3, '9884542487407331249', 'dpn', 'restricted', true],
    [4, '9700280040122529948', 'is2', 'restricted', true],
    [5, '8648377547929788715', 'bpng', 'public', false],
    [6, '6983892400042691068', 'cbsi', 'restricted', true],
    [7, '6647857470246403404', 'is', 'restricted', true],
  ] as const)('shows exact public policy for lane%s without inventing operator fields', async (lane, id, alias, visibility, required) => {
    routeState.params.laneId = String(lane);
    routeState.params.dataspaceId = id;
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...nexusStatusPayload,
        dataspace_catalog: [{ lane_id: lane, dataspace_id: id, alias, visibility, manifest_required: required, manifest_ready: required }],
        teu_dataspace_backlog: [{ ...nexusStatusPayload.teu_dataspace_backlog[0], lane_id: lane, dataspace_id: id, alias }],
      },
    });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain(visibility);
    const values = wrapper.get('[data-test="dataspace-details-governance"]').findAll('.data-field__value');
    expect(values.map((field) => field.text())).toEqual([required ? 'Yes' : 'No', required ? 'Yes' : 'No', i18n.global.t('none')]);
    expect(wrapper.text()).not.toContain(i18n.global.t('dataspaces.quorum'));
    expect(wrapper.text()).not.toContain(i18n.global.t('dataspaces.validators'));
    expect(api.fetchSumeragiStatus).not.toHaveBeenCalled();
  });

  it('keeps absent public manifest observations unknown instead of turning them into No', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...nexusStatusPayload, dataspace_catalog: [{ lane_id: 7, dataspace_id: '42', alias: 'lane-seven' }] },
    });
    const wrapper = factory();
    await flushPromises();
    const values = wrapper.get('[data-test="dataspace-details-governance"]').findAll('.data-field__value');
    expect(values.map((field) => field.text())).toEqual(['-', '-', i18n.global.t('none')]);
  });

  it('retains the real BPNG ID and lane8 in the saved public-node scope', async () => {
    const id = '8648377547929788715';
    routeState.params.laneId = '8';
    routeState.params.dataspaceId = id;
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...nexusStatusPayload,
        dataspace_catalog: [{ lane_id: 8, dataspace_id: id, alias: 'bpng' }],
        teu_dataspace_backlog: [{ ...nexusStatusPayload.teu_dataspace_backlog[0], lane_id: 8, dataspace_id: id, alias: 'bpng' }],
      },
    });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.get('[data-test="dataspace-details-core"]').text()).toContain(`bpng (#${id})`);
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('BPNG public node');
    await inputs[1].setValue('https://taira.sora.org');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-test="dataspace-details-open-scoped"]').trigger('click');
    expect(pushSpy).toHaveBeenCalledWith({ path: '/blocks', query: { torii: 'https://taira.sora.org', dataspaceLaneId: '8', dataspaceId: id } });
  });

  it('refuses an unregistered lane even when its backlog row exists', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...nexusStatusPayload, dataspace_catalog: [{ lane_id: 8, dataspace_id: '42', alias: 'lane-eight' }] },
    });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('[data-test="dataspace-details-core"]').exists()).toBe(false);
  });

  it('adds and removes a saved public node', async () => {
    const wrapper = factory();
    await flushPromises();

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Public node A');
    await inputs[1].setValue('https://public-node-a.example:18080/v1/explorer');
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

  it('opens scoped explorer with selected public node', async () => {
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
