import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { toExplorerScopeQuery } from '@/shared/lib/explorer-scope';
import HomePage from './HomePage.vue';
vi.mock('@/shared/api', () => ({ getToriiBaseUrl: () => 'https://torii.example', isToriiBaseUrlForced: () => false }));
describe('HomePage', () => {
  it('leads with the active node, real metrics and recent activity without sample destinations', () => {
    const wrapper = mount(HomePage, { global: {
      mocks: { $t: (key: string) => key },
      stubs: { HomePageInfo: true, LatestBlocks: true, LatestTransactions: true },
    } });
    expect(wrapper.get('h1').text()).toBe('ux.overview');
    expect(wrapper.text()).toContain('https://torii.example');
    expect(wrapper.find('home-page-info-stub').exists()).toBe(true);
    expect(wrapper.find('latest-blocks-stub').exists()).toBe(true);
    expect(wrapper.find('latest-transactions-stub').exists()).toBe(true);
    expect(wrapper.find('.home-page__search-tag').exists()).toBe(false);
    expect(wrapper.find('nav').exists()).toBe(false);
    expect(wrapper.find('.home-page__scope').exists()).toBe(false);
  });

  it('shows the current dataspace and lane and clears that context after leaving scope', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'home', component: HomePage }] });
    await router.push({ name: 'home', query: toExplorerScopeQuery({ torii: 'https://torii.example', dataspaceLaneId: '7', dataspaceId: '42' }) });
    await router.isReady();
    const wrapper = mount(HomePage, { global: {
      plugins: [router],
      mocks: { $t: (key: string, params?: { lane: string; dataspace: string }) => key === 'scopedExplorer.dataspaceContext' ? `Dataspace ${params?.dataspace} on lane ${params?.lane}` : key },
      stubs: { HomePageInfo: true, LatestBlocks: true, LatestTransactions: true },
    } });
    expect(wrapper.get('.home-page__scope').text()).toBe('Dataspace 42 on lane 7');
    await router.push({ name: 'home', query: {} });
    await flushPromises();
    expect(wrapper.find('.home-page__scope').exists()).toBe(false);
    expect(wrapper.text()).toContain('https://torii.example');
  });
});
