import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import BaseButton from './BaseButton.vue';
import type { ExplorerRouteScope } from '@/shared/lib/explorer-scope';

const scopeState = ref<ExplorerRouteScope | null>(null) as Ref<ExplorerRouteScope | null>;

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => scopeState,
}));

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          'data-test': 'router-link',
          'data-to': typeof props.to === 'string' ? props.to : JSON.stringify(props.to),
        },
        slots.default?.()
      );
  },
});

describe('BaseButton', () => {
  it('preserves scope query for internal route-name destinations', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = mount(BaseButton, {
      props: {
        to: { name: 'account-details', params: { id: 'alice' } },
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    const to = JSON.parse(wrapper.get('[data-test="router-link"]').attributes('data-to') ?? '{}');
    expect(to).toMatchObject({
      name: 'account-details',
      params: { id: 'alice' },
      query: {
        torii: 'https://public-node.example:8080',
        dataspaceLaneId: '7',
        dataspaceId: '42',
      },
    });
  });

  it('keeps home exit destinations unscoped', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = mount(BaseButton, {
      props: {
        to: '/',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    expect(wrapper.get('[data-test="router-link"]').attributes('data-to')).toBe('/');
  });

  it('renders a disabled button instead of a link when navigation is unavailable', () => {
    const wrapper = mount(BaseButton, {
      props: {
        to: { name: 'account-details', params: { id: 'alice' } },
        disabled: true,
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    expect(wrapper.find('[data-test="router-link"]').exists()).toBe(false);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });
});
