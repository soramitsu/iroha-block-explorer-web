import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Dataspaces from './Dataspaces.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const pushSpy = vi.fn();

vi.mock('@/shared/api', () => ({
  fetchNexusPublicStatus: vi.fn(),
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    push: pushSpy,
  }),
}));

import * as api from '@/shared/api';

const statusPayload = {
  blocks: 21,
  txs_approved: 120,
  txs_rejected: 2,
  queue_size: 1,
  teu_dataspace_backlog: [
    {
      lane_id: 3,
      dataspace_id: 10,
      fault_tolerance: 1,
      backlog: 4,
      age_slots: 5,
      virtual_finish: 9,
      tx_served: 7,
      alias: 'sbp',
      description: 'State Bank of Pakistan dataspace',
    },
    {
      lane_id: 1,
      dataspace_id: 12,
      fault_tolerance: 1,
      backlog: 3,
      age_slots: 2,
      virtual_finish: 7,
      tx_served: 11,
      alias: 'uae',
      description: 'Mock UAE central bank dataspace',
    },
    {
      lane_id: 0,
      dataspace_id: 0,
      fault_tolerance: 3,
      backlog: 0,
      age_slots: 0,
      virtual_finish: 0,
      tx_served: 1,
      alias: 'universal',
      description: 'Single-lane data space',
    },
    {
      lane_id: 0,
      dataspace_id: 10,
      fault_tolerance: 1,
      backlog: 1,
      age_slots: 1,
      virtual_finish: 2,
      tx_served: 5,
      alias: 'sbp',
      description: 'State Bank of Pakistan dataspace',
    },
  ],
};

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};

const BaseTableStub = {
  props: ['items', 'rowKey'],
  emits: ['click:row'],
  template:
    '<div><slot name="header" /><button v-for="item in items" :key="rowKey ? rowKey(item) : item.dataspace_id" :data-test="\'row-\' + (rowKey ? rowKey(item) : item.dataspace_id)" @click="$emit(\'click:row\', item)"><slot name="row" :item="item" /></button></div>',
};

const BaseLoadingStub = {
  template: '<div>loading...</div>',
};

describe('Dataspaces overview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushSpy.mockReset();
    pushSpy.mockReturnValue(Promise.resolve());
  });

  const factory = () =>
    mount(Dataspaces, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseLoading: BaseLoadingStub,
        },
      },
    });

  it('loads registered dataspaces on mount and renders registry stats', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });

    const wrapper = factory();
    await flushPromises();

    expect(api.fetchNexusPublicStatus).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-test="dataspaces-stats"]').text()).toContain('Registered dataspaces');
    expect(wrapper.text()).toContain('sbp (#10)');
    expect(wrapper.text()).toContain('uae (#12)');
    expect(wrapper.findAll('[data-test^="row-"]')).toHaveLength(3);
  });

  it('sorts dataspaces by id, aggregates lanes, and routes to the representative detail lane on row click', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });

    const wrapper = factory();
    await flushPromises();

    const rows = wrapper.findAll('[data-test^="row-"]');
    expect(rows[0].text()).toContain('universal (#0)');
    expect(rows[1].text()).toContain('sbp (#10)');
    expect(rows[1].text()).toContain('0, 3');
    expect(rows[2].text()).toContain('uae (#12)');

    await rows[1].trigger('click');
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'dataspaces-details',
      params: {
        laneId: '3',
        dataspaceId: '10',
      },
    });
  });

  it('shows load failure when registry request is unsuccessful', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: UNKNOWN_ERROR,
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-test="dataspaces-error"]').text()).toContain('Unable to load dataspace summary');
  });

  it('disables refresh button while request is in flight', async () => {
    let resolveRequest!: (value: unknown) => void;
    const pendingRequest = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pendingRequest);

    const wrapper = factory();
    await nextTick();

    expect(wrapper.get('[data-test="dataspaces-refresh"]').attributes('disabled')).toBeDefined();

    resolveRequest({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });
    await flushPromises();

    expect(wrapper.get('[data-test="dataspaces-refresh"]').attributes('disabled')).toBeUndefined();
  });
});
