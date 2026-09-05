import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseCollectionState from './BaseCollectionState.vue';
import { i18n } from '@/shared/lib/localization';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

vi.mock('@/shared/api', () => ({ getToriiBaseUrl: () => 'https://node.example' }));

function mountCollection(snapshot: ResourceSnapshot<unknown>, count = 0, filtered = false, table = false) {
  return mount(BaseCollectionState, {
    props: { snapshot, count, filtered, table },
    slots: { default: '<div data-test="rows">Validated rows and pagination</div>' },
    global: { plugins: [i18n], stubs: { BaseButton: { template: '<button><slot /></button>' }, BaseLoading: true } },
  });
}
const ready: ResourceSnapshot<unknown> = { status: 'ready', data: [], isRefreshing: false, refreshError: null };

describe('BaseCollectionState', () => {
  it('never reports empty records or renders pagination during initial loading', () => {
    const wrapper = mountCollection({ status: 'initial-loading' });
    expect(wrapper.get('[role="status"]').text()).toContain(i18n.global.t('ux.collection.loading'));
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="collection-empty"]').exists()).toBe(false);
  });

  it('identifies the failed node and retries an initial failure without zero-row claims', async () => {
    const wrapper = mountCollection({ status: 'error', problem: { kind: 'network', message: 'offline' } });
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('ux.collection.error', { node: 'https://node.example' }));
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="collection-empty"]').exists()).toBe(false);
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('treats an unavailable collection endpoint as a retriable failure', () => {
    const wrapper = mountCollection({ status: 'not-found' });
    expect(wrapper.find('[data-test="resource-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collection-empty"]').exists()).toBe(false);
  });

  it('distinguishes an empty collection from filtered results and offers filter recovery', async () => {
    const wrapper = mountCollection(ready);
    expect(wrapper.get('[data-test="collection-empty"]').text()).toContain(i18n.global.t('ux.collection.empty'));
    expect(wrapper.find('[data-test="collection-reset"]').exists()).toBe(false);
    await wrapper.setProps({ filtered: true });
    expect(wrapper.get('[data-test="collection-empty"]').text()).toContain(i18n.global.t('ux.collection.filteredEmpty'));
    await wrapper.get('[data-test="collection-reset"]').trigger('click');
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('retains validated rows during refresh and exposes a stale notice with retry after failure', async () => {
    const wrapper = mountCollection({ ...ready, isRefreshing: true }, 2);
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(true);
    expect(wrapper.get('[aria-busy]').attributes('aria-busy')).toBe('true');
    await wrapper.setProps({ snapshot: { ...ready, refreshError: { kind: 'timeout', message: 'timeout' } } });
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('ux.collection.stale', { node: 'https://node.example' }));
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(true);
    await wrapper.get('[data-test="resource-refresh-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('preserves pagination controls for successfully loaded empty cursor pages in table mode', () => {
    const wrapper = mountCollection(ready, 0, false, true);
    expect(wrapper.find('[data-test="rows"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="collection-empty"]').exists()).toBe(false);
  });
});
