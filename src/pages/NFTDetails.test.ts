import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import NFTDetails from './NFTDetails.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const route = ref({ params: { id: 'passport$identity.main' } });
const refetch = vi.fn();
const expose = ref<any>();

vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: route }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => ref({ expose: expose.value }),
}));

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => ref(null),
}));

function mountPage() {
  return mount(NFTDetails, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: { props: ['title'], template: '<section><h1>{{ title }}</h1><slot /></section>' },
        BaseLoading: { template: '<span data-test="loading" />' },
        DataField: {
          props: ['title', 'value', 'hash'],
          template: '<div data-test="field">{{ title }} {{ value ?? hash }}</div>',
        },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('NFTDetails resource states', () => {
  beforeEach(() => {
    refetch.mockClear();
    route.value = { params: { id: 'passport$identity.main' } };
    const result = {
      status: SUCCESSFUL_FETCHING,
      data: {
        id: 'passport$identity.main',
        owned_by: 'alice@wonderland',
        metadata: { class: 'travel' },
      },
    };
    expose.value = {
      isLoading: false,
      data: result,
      snapshot: {
        status: 'ready',
        data: result,
        isRefreshing: false,
        refreshError: null,
      },
      refetch,
    };
  });

  it('renders the authoritative NFT owner and metadata when ready', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('passport');
    expect(wrapper.text()).toContain('alice@wonderland');
    expect(wrapper.text()).toContain('travel');
  });

  it('distinguishes not-found from a terminal request error', async () => {
    expose.value = {
      isLoading: false,
      data: undefined,
      snapshot: { status: 'not-found' },
      refetch,
    };
    const missing = mountPage();
    await flushPromises();
    expect(missing.text()).toContain('NFT not found');
    expect(missing.find('[role="alert"]').exists()).toBe(false);

    expose.value = {
      isLoading: false,
      data: undefined,
      snapshot: {
        status: 'error',
        problem: { kind: 'network', message: 'offline' },
      },
      refetch,
    };
    const failed = mountPage();
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('NFT could not be loaded');
  });

  it('does not hide a terminal error behind an automatic retry', async () => {
    expose.value = {
      isLoading: false,
      data: undefined,
      snapshot: {
        status: 'error',
        problem: { kind: 'network', message: 'offline' },
      },
      refetch,
    };
    const wrapper = mountPage();
    await flushPromises();

    expect(refetch).not.toHaveBeenCalled();
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
