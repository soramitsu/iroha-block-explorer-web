import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, type Ref } from 'vue';
import type { ExplorerRouteScope } from '@/shared/lib/explorer-scope';

import TheHeader from './TheHeader.vue';

const HeaderLogoStub = { template: '<div data-test="header-logo" />' };
const SearchFieldStub = { template: '<div data-test="search-field" />' };
const GroupedNavigationStub = { template: '<nav data-test="grouped-navigation" />' };
const NodeSettingsStub = { template: '<button data-test="node-settings" />' };
const ScopedExplorerControlStub = { template: '<button data-test="scoped-explorer-control" />' };
const ThemeSwitcherStub = { template: '<button data-test="theme-switcher" />' };
const LangDropdownStub = { template: '<button data-test="lang-dropdown" />' };

const scopeState = ref<ExplorerRouteScope | null>(null) as Ref<ExplorerRouteScope | null>;

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => scopeState,
}));

describe('TheHeader', () => {
  function factory() {
    return mount(TheHeader, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          HeaderLogo: HeaderLogoStub,
          SearchField: SearchFieldStub,
          GroupedNavigation: GroupedNavigationStub,
          NodeSettings: NodeSettingsStub,
          ScopedExplorerControl: ScopedExplorerControlStub,
          ThemeSwitcher: ThemeSwitcherStub,
          LangDropdown: LangDropdownStub,
          ExplorerReadAccess: { template: '<button data-test="read-access" />' },
        },
      },
    });
  }

  it('renders the primary controls without conditional hiding', () => {
    scopeState.value = null;
    const wrapper = factory();

    expect(wrapper.find('[data-test="grouped-navigation"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-field"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="node-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="scoped-explorer-control"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="theme-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="lang-dropdown"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="read-access"]').exists()).toBe(true);
  });

  it('replaces global node settings with scoped explorer control when scope is active', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = factory();

    expect(wrapper.find('[data-test="scoped-explorer-control"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="node-settings"]').exists()).toBe(false);
  });
});
