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
  dataspace_catalog: [
    { lane_id: 0, dataspace_id: '0', alias: 'universal' },
    { lane_id: 3, dataspace_id: '10', alias: 'sbp' },
    { lane_id: 1, dataspace_id: '12', alias: 'uae' },
  ],
  teu_dataspace_backlog: [
    {
      lane_id: 3,
      dataspace_id: '10',
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
      dataspace_id: '12',
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
      dataspace_id: '0',
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
      dataspace_id: '10',
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

  it('exposes all six visual columns through table header and cell roles', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(6);
    expect(wrapper.findAll('[data-test^="row-"]')[0].findAll('[role="cell"]')).toHaveLength(6);
  });

  it('applies the same page grid scope to real table headers and data rows', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: statusPayload });
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    const wrapper = mount(Dataspaces, {
      global: {
        plugins: [i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub, BaseLoading: BaseLoadingStub },
      },
    });
    try {
      await flushPromises();
      const rows = wrapper.findAll('.base-table [role="row"]');
      expect(rows).toHaveLength(4);
      expect(rows[0].findAll('[role="columnheader"]')).toHaveLength(6);
      for (const row of rows) {
        expect(row.element.matches('.dataspaces-page__table .content-row')).toBe(true);
      }
    } finally {
      wrapper.unmount();
      Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true });
    }
  });

  it('sorts dataspaces by id, aggregates only catalog lanes, and routes to the representative detail lane on row click', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: statusPayload,
    });

    const wrapper = factory();
    await flushPromises();

    const rows = wrapper.findAll('[data-test^="row-"]');
    expect(rows[0].text()).toContain('universal (#0)');
    expect(rows[1].text()).toContain('sbp (#10)');
    expect(rows[1].findAll('[role="cell"]')[1].text()).toBe('3');
    expect(rows[1].findAll('[role="cell"]')[3].text()).toBe('4');
    expect(rows[1].findAll('[role="cell"]')[5].text()).toBe('7');
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

  it('preserves the real BPNG u64 ID and selects catalogue lane8 rather than backlog lane0', async () => {
    const id = '8648377547929788715';
    const adjacentId = '8648377547929788716';
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...statusPayload,
        dataspace_catalog: [
          { lane_id: 8, dataspace_id: id, alias: 'bpng' },
          { lane_id: 7, dataspace_id: adjacentId, alias: 'neighbor' },
        ],
        teu_dataspace_backlog: [
          ...[0, 8].map((lane_id) => ({ ...statusPayload.teu_dataspace_backlog[0], lane_id, dataspace_id: id, alias: 'bpng' })),
          { ...statusPayload.teu_dataspace_backlog[0], lane_id: 7, dataspace_id: adjacentId, alias: 'neighbor' },
        ],
      },
    });
    const wrapper = factory();
    await flushPromises();
    const rows = wrapper.findAll('[data-test^="row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain(`bpng (#${id})`);
    expect(rows[1].text()).toContain(`neighbor (#${adjacentId})`);
    await rows[0].trigger('click');
    expect(pushSpy).toHaveBeenCalledWith({ name: 'dataspaces-details', params: { laneId: '8', dataspaceId: id } });
  });

  it('uses the eight registered lane bindings instead of the scheduler cross-product', async () => {
    const catalog = [
      ...[0, 1, 2].map((lane_id) => ({ lane_id, dataspace_id: '0', alias: 'universal' })),
      { lane_id: 3, dataspace_id: '9884542487407331249', alias: 'dpn' },
      { lane_id: 4, dataspace_id: '9700280040122529948', alias: 'is2' },
      { lane_id: 5, dataspace_id: '8648377547929788715', alias: 'bpng' },
      { lane_id: 6, dataspace_id: '6983892400042691068', alias: 'cbsi' },
      { lane_id: 7, dataspace_id: '6647857470246403404', alias: 'is' },
    ];
    const dataspaces = [...new Map(catalog.map((entry) => [entry.dataspace_id, entry])).values()];
    const backlog = dataspaces.flatMap((entry) => Array.from({ length: 8 }, (_, lane_id) => {
      const registered = catalog.some((row) => row.dataspace_id === entry.dataspace_id && row.lane_id === lane_id);
      return {
        ...statusPayload.teu_dataspace_backlog[0],
        ...entry,
        lane_id,
        backlog: registered ? lane_id + 1 : 99999,
        age_slots: registered ? lane_id : 99999,
        tx_served: registered ? 10 * (lane_id + 1) : 99999,
      };
    }));
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...statusPayload, dataspace_catalog: catalog, teu_dataspace_backlog: backlog },
    });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.findAll('[data-test^="row-"]')).toHaveLength(6);
    for (const entry of dataspaces) {
      const lanes = catalog.filter((row) => row.dataspace_id === entry.dataspace_id).map((row) => row.lane_id);
      const row = wrapper.get(`[data-test="row-${entry.dataspace_id}"]`);
      const cells = row.findAll('[role="cell"]');
      expect(cells[0].text()).toBe(`${entry.alias} (#${entry.dataspace_id})`);
      expect(cells[1].text()).toBe(lanes.join(', '));
      expect(cells[3].text()).toBe(String(lanes.reduce((sum, lane) => sum + lane + 1, 0)));
      expect(cells[4].text()).toBe(String(Math.max(...lanes)));
      expect(cells[5].text()).toBe(String(lanes.reduce((sum, lane) => sum + 10 * (lane + 1), 0)));
      await row.trigger('click');
      expect(pushSpy).toHaveBeenLastCalledWith({ name: 'dataspaces-details', params: { laneId: String(lanes[0]), dataspaceId: entry.dataspace_id } });
    }
    expect(wrapper.text()).not.toContain(i18n.global.t('dataspaces.overviewSystemIds'));
  });

  it('does not invent a lane binding from backlog when the catalogue has no matching row', async () => {
    (api.fetchNexusPublicStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...statusPayload, dataspace_catalog: [] },
    });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.findAll('[data-test^="row-"]')).toHaveLength(0);
    expect(pushSpy).not.toHaveBeenCalled();
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
