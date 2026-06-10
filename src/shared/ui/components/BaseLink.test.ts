import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import BaseLink from './BaseLink.vue';
import type { ExplorerRouteScope } from '@/shared/lib/explorer-scope';

const scopeState = ref<ExplorerRouteScope | null>(null) as Ref<ExplorerRouteScope | null>;
const toriiBaseUrlState = ref('https://nexus.mof3.sora.org:18080');

vi.mock('@/shared/ui/composables/useExplorerScopeNavigation', () => ({
  useCurrentExplorerScope: () => scopeState,
}));

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => toriiBaseUrlState.value,
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

describe('BaseLink', () => {
  it('preserves account detail links without rewriting their prefix', () => {
    scopeState.value = null;
    toriiBaseUrlState.value = 'https://taira.sora.org';

    const wrapper = mount(BaseLink, {
      props: {
        to: '/accounts/sorau%E3%83%AD1N%E3%83%A9hBUd2B%E3%83%84%E3%83%B2%E3%83%88i%E3%83%A4%E3%83%8B%E3%83%84%E3%83%8CKS%E3%83%86a%E3%83%AA%E3%83%A1%E3%83%A2Q%E3%83%A9r%E3%83%A1o%E3%83%AA%E3%83%8An%E3%82%A6%E3%83%AAbQ%E3%82%A6QJ%E3%83%8BLJ5HSE',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    expect(wrapper.get('[data-test="router-link"]').attributes('data-to')).toBe(
      '/accounts/sorau%E3%83%AD1N%E3%83%A9hBUd2B%E3%83%84%E3%83%B2%E3%83%88i%E3%83%A4%E3%83%8B%E3%83%84%E3%83%8CKS%E3%83%86a%E3%83%AA%E3%83%A1%E3%83%A2Q%E3%83%A9r%E3%83%A1o%E3%83%AA%E3%83%8An%E3%82%A6%E3%83%AAbQ%E3%82%A6QJ%E3%83%8BLJ5HSE'
    );
  });

  it('preserves scoped explorer query for internal explorer links', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = mount(BaseLink, {
      props: {
        to: '/blocks/10?foo=bar',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    const to = wrapper.get('[data-test="router-link"]').attributes('data-to');
    expect(to).toContain('/blocks/10?');
    expect(to).toContain('foo=bar');
    expect(to).toContain('torii=https%3A%2F%2Fpublic-node.example%3A8080');
    expect(to).toContain('dataspaceLaneId=7');
    expect(to).toContain('dataspaceId=42');
  });

  it('does not rewrite home exit links', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = mount(BaseLink, {
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

  it('does not rewrite external links', () => {
    scopeState.value = {
      torii: 'https://public-node.example:8080',
      dataspaceLaneId: '7',
      dataspaceId: '42',
    };

    const wrapper = mount(BaseLink, {
      props: {
        to: 'https://example.com',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    expect(wrapper.get('a').attributes('href')).toBe('https://example.com');
  });
});
