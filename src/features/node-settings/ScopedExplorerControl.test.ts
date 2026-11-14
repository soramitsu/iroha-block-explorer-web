import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ScopedExplorerControl from './ScopedExplorerControl.vue';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useNodeSettingsDropdown } from '@/shared/ui/composables/header-portal';

enableAutoUnmount(afterEach);

const {
  scopeState,
  currentRouteState,
  replaceSpy,
  pushGlobalSpy,
  setRouteScopedToriiBaseUrlSpy,
  listDataspacePublicNodesSpy,
  upsertDataspacePublicNodeSpy,
  getConfiguredToriiBaseUrlSpy,
  isToriiBaseUrlForcedSpy,
} = vi.hoisted(() => ({
  scopeState: {
    value: {
      torii: 'https://public-a.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    },
  },
  currentRouteState: {
    value: {
      path: '/blocks',
      query: {
        foo: 'bar',
        torii: 'https://public-a.example:8080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
      hash: '#latest',
    },
  },
  replaceSpy: vi.fn(() => Promise.resolve()),
  pushGlobalSpy: vi.fn(() => Promise.resolve()),
  setRouteScopedToriiBaseUrlSpy: vi.fn(),
  listDataspacePublicNodesSpy: vi.fn(),
  upsertDataspacePublicNodeSpy: vi.fn(),
  isToriiBaseUrlForcedSpy: vi.fn(() => false),
  getConfiguredToriiBaseUrlSpy: vi.fn(() => 'https://registry.example:8080'),
}));

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useScopedExplorerNavigation: () => ({
    scope: scopeState,
    pushGlobal: pushGlobalSpy,
    router: {
      currentRoute: currentRouteState,
      replace: replaceSpy,
    },
  }),
}));

vi.mock('@/shared/api', () => ({
  getConfiguredToriiBaseUrl: getConfiguredToriiBaseUrlSpy,
  isToriiBaseUrlForced: isToriiBaseUrlForcedSpy,
  setRouteScopedToriiBaseUrl: setRouteScopedToriiBaseUrlSpy,
}));

vi.mock('@/shared/lib/dataspace-public-nodes', () => ({
  listDataspacePublicNodes: listDataspacePublicNodesSpy,
  upsertDataspacePublicNode: upsertDataspacePublicNodeSpy,
}));

const BaseButtonStub = {
  props: ['disabled', 'nativeType'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" :type="nativeType || \'button\'" @click="$emit(\'click\', $event)"><slot /></button>',
};

describe('ScopedExplorerControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isToriiBaseUrlForcedSpy.mockReturnValue(false);
    document.body.innerHTML = `<div id="${PORTAL_ID}"></div>`;
    const dropdown = useNodeSettingsDropdown();
    if (dropdown.isOpen.value) dropdown.toggle();
    (scopeState as any).value = {
      torii: 'https://public-a.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };
    (currentRouteState as any).value = {
      path: '/blocks',
      query: {
        foo: 'bar',
        torii: 'https://public-a.example:8080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
      hash: '#latest',
    };
    listDataspacePublicNodesSpy.mockReturnValue([
      { label: 'Public A', url: 'https://public-a.example:8080', source: 'manual' },
      { label: 'Public B', url: 'https://public-b.example:8080', source: 'manual' },
    ]);
  });

  function factory() {
    return mount(ScopedExplorerControl, {
      attachTo: document.body,
      global: {
        stubs: {
          BaseButton: BaseButtonStub,
        },
        mocks: {
          $t: (key: string, params?: Record<string, string>) => {
            if (key === 'scopedExplorer.activeNode') return `Scoped node: ${params?.node ?? ''}`;
            if (key === 'scopedExplorer.dataspaceContext') {
              return `Dataspace ${params?.dataspace ?? ''} on lane ${params?.lane ?? ''}`;
            }
            return key;
          },
        },
      },
    });
  }

  it('switches scoped node without mutating global node settings', async () => {
    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="scoped-explorer-control-button"]').trigger('click');
    await flushPromises();

    const nodeButtons = document.body.querySelectorAll('.scoped-explorer-control__node');
    expect(nodeButtons.length).toBe(2);

    (nodeButtons[1] as HTMLButtonElement).click();
    await flushPromises();

    expect(upsertDataspacePublicNodeSpy).toHaveBeenCalledWith(
      {
        registryNode: 'https://registry.example:8080',
        laneId: '7',
        dataspaceId: '42',
      },
      {
        label: 'Public B',
        url: 'https://public-b.example:8080',
      }
    );
    expect(setRouteScopedToriiBaseUrlSpy).toHaveBeenCalledWith('https://public-b.example:8080');
    expect(replaceSpy).toHaveBeenCalledWith({
      path: '/blocks',
      query: {
        foo: 'bar',
        torii: 'https://public-b.example:8080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
      hash: '#latest',
    });
    expect(useNodeSettingsDropdown().isOpen.value).toBe(false);
  });

  it('exits scoped explorer back to dataspaces details', async () => {
    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-test="scoped-explorer-control-button"]').trigger('click');
    await flushPromises();

    const exitButton = document.body.querySelector('.scoped-explorer-control__actions button') as HTMLButtonElement;
    expect(exitButton).not.toBeNull();
    exitButton.click();
    await flushPromises();

    expect(pushGlobalSpy).toHaveBeenCalledWith({
      name: 'dataspaces-details',
      params: {
        laneId: '7',
        dataspaceId: '42',
      },
    });
    expect(useNodeSettingsDropdown().isOpen.value).toBe(false);
  });


  it('labels the forced endpoint and disables scoped endpoint changes', async () => {
    isToriiBaseUrlForcedSpy.mockReturnValue(true);
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.get('[data-test="scoped-explorer-control-button"]').text()).toContain('registry.example:8080');
    await wrapper.get('[data-test="scoped-explorer-control-button"]').trigger('click');
    const nodeButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.scoped-explorer-control__node'));
    expect(nodeButtons).toHaveLength(2);
    expect(nodeButtons.every((button) => button.disabled)).toBe(true);
    nodeButtons[1]?.click();
    nodeButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(setRouteScopedToriiBaseUrlSpy).not.toHaveBeenCalled();
    expect(upsertDataspacePublicNodeSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
