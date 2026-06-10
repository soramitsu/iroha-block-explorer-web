import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useCurrentExplorerScope, useScopedExplorerNavigation } from './useExplorerScopeNavigation';

const toriiBaseUrlState = ref('https://nexus.mof3.sora.org:18080');

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => toriiBaseUrlState.value,
}));

const Probe = defineComponent({
  setup() {
    const scope = useCurrentExplorerScope();
    return {
      scope,
    };
  },
  template: '<div>{{ scope ? JSON.stringify(scope) : "null" }}</div>',
});

const NavigationProbe = defineComponent({
  setup() {
    const navigation = useScopedExplorerNavigation();
    const normalizedTo = computed(() =>
      navigation.toScopedLocation(
        '/accounts/sorau%E3%83%AD1N%E3%83%A9hBUd2B%E3%83%84%E3%83%B2%E3%83%88i%E3%83%A4%E3%83%8B%E3%83%84%E3%83%8CKS%E3%83%86a%E3%83%AA%E3%83%A1%E3%83%A2Q%E3%83%A9r%E3%83%A1o%E3%83%AA%E3%83%8An%E3%82%A6%E3%83%AAbQ%E3%82%A6QJ%E3%83%8BLJ5HSE'
      )
    );
    return {
      normalizedTo,
    };
  },
  template: '<div>{{ normalizedTo }}</div>',
});

describe('useCurrentExplorerScope', () => {
  it('returns null without a router and does not emit vue-router injection warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mount(Probe);

    expect(wrapper.text()).toBe('null');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('parses explorer scope from the current scoped route when a router is available', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/blocks',
          name: 'blocks-list',
          component: { template: '<div />' },
        },
      ],
    });

    await router.push('/blocks?torii=https%3A%2F%2Ftorii.example&dataspaceLaneId=7&dataspaceId=42');
    await router.isReady();

    const wrapper = mount(Probe, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.text()).toBe(
      JSON.stringify({
        torii: 'https://torii.example',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      })
    );
  });

  it('preserves account routes while still applying scoped explorer query params', async () => {
    toriiBaseUrlState.value = 'https://nexus.mof3.sora.org:18080';
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/blocks',
          name: 'blocks-list',
          component: { template: '<div />' },
        },
      ],
    });

    await router.push('/blocks?torii=https%3A%2F%2Ftaira.sora.org&dataspaceLaneId=7&dataspaceId=42');
    await router.isReady();

    const wrapper = mount(NavigationProbe, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('/accounts/sorau');
    expect(wrapper.text()).toContain('torii=https%3A%2F%2Ftaira.sora.org');
    expect(wrapper.text()).toContain('dataspaceLaneId=7');
    expect(wrapper.text()).toContain('dataspaceId=42');
  });
});
