import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import AccountPermissionsView from './AccountPermissionsView.vue';

const apiMocks = vi.hoisted(() => ({
  fetchAccountPermissions: vi.fn(),
}));

vi.mock('@/shared/api', () => ({
  fetchAccountPermissions: apiMocks.fetchAccountPermissions,
}));

const ACCOUNT = 'account:alice';

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  props: { title: { type: String, default: '' } },
  template: '<section><h2>{{ title }}</h2><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    cursorPagination: { type: Object, default: null },
  },
  emits: ['update:cursor', 'update:pageSize'],
  template: `
    <div class="base-table-stub" :data-next-cursor="cursorPagination?.nextCursor">
      <slot name="header" />
      <div v-for="item in items" :key="item.name" class="base-table-row">
        <slot name="row" :item="item" />
      </div>
    </div>
  `,
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
});

function permissionResponse(items: Record<string, unknown>[]) {
  return {
    status: 'ok',
    data: {
      items,
      total: undefined,
      nextCursor: 'permissions-next',
    },
  };
}

async function factory(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/account', component: { template: '<div />' } }],
  });
  await router.push({ path: '/account', query });
  await router.isReady();

  const wrapper = mount(AccountPermissionsView, {
    props: { accountId: ACCOUNT },
    global: {
      plugins: [router],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseLoading: { template: '<span>spinner</span>' },
        BaseTable: BaseTableStub,
      },
    },
  });

  await flushPromises();
  return wrapper;
}

describe('AccountPermissionsView', () => {
  beforeEach(() => {
    apiMocks.fetchAccountPermissions.mockReset();
  });

  it('reads pagination from the URL and renders the exact server payload without invented provenance', async () => {
    apiMocks.fetchAccountPermissions.mockResolvedValue(
      permissionResponse([
        {
          name: 'CanTransferAsset',
          payload: {
            asset: 'rose#wonderland',
            ceiling: '90071992547409931234567890.000000000000000001',
            nested: { dataspace: 'private-settlement' },
          },
        },
      ])
    );

    const wrapper = await factory({ permissions_cursor: 'permissions-current', permissions_limit: '50' });

    expect(apiMocks.fetchAccountPermissions).toHaveBeenCalledWith(ACCOUNT, { cursor: 'permissions-current', limit: 50 });
    expect(wrapper.text()).toContain('CanTransferAsset');
    expect(wrapper.text()).toContain('90071992547409931234567890.000000000000000001');
    expect(wrapper.text()).toContain('private-settlement');
    expect(wrapper.get('.base-table-stub').attributes('data-next-cursor')).toBe('permissions-next');
    expect(wrapper.getComponent(BaseTableStub).props('cursorPagination')?.total).toBeUndefined();
    expect(wrapper.get('[data-test="permissions-provenance-notice"]').text()).toContain(
      'does not provide per-entry provenance'
    );
    expect(wrapper.get('[data-test="permissions-provenance-notice"]').text()).toContain(
      'direct grants and permissions inherited from assigned roles'
    );
  });

  it('requests the opaque continuation returned by Torii', async () => {
    apiMocks.fetchAccountPermissions.mockResolvedValue(permissionResponse([{ name: 'CanTransferAsset', payload: {} }]));
    const wrapper = await factory();

    wrapper.getComponent(BaseTableStub).vm.$emit('update:cursor', 'permissions-next');
    await flushPromises();

    expect(apiMocks.fetchAccountPermissions).toHaveBeenLastCalledWith(ACCOUNT, { cursor: 'permissions-next', limit: 10 });
  });

  it.each([
    [
      'permission-denied',
      { status: 'permission-denied', error: new Error('not visible') },
      '[data-test="permissions-permission-denied"]',
      'Torii denied access',
    ],
    [
      'error',
      { status: 'unknown-error', error: new Error('invalid response') },
      '[data-test="permissions-error"]',
      'invalid response',
    ],
  ])('renders the %s state distinctly from an empty permission set', async (_name, result, selector, message) => {
    apiMocks.fetchAccountPermissions.mockResolvedValue(result);

    const wrapper = await factory();

    expect(wrapper.get(selector).text()).toContain(message);
    expect(wrapper.find('[data-test="permissions-empty"]').exists()).toBe(false);
  });

  it('renders a successful empty state with caller-visibility context', async () => {
    apiMocks.fetchAccountPermissions.mockResolvedValue(permissionResponse([]));

    const wrapper = await factory();

    expect(wrapper.get('[data-test="permissions-empty"]').text()).toContain('no effective permissions visible');
    expect(wrapper.get('[data-test="permissions-provenance-notice"]').text()).toContain('unsigned, caller-visible');
  });

  it('shows initial loading until the first response settles', async () => {
    let resolveRequest: ((value: ReturnType<typeof permissionResponse>) => void) | undefined;
    apiMocks.fetchAccountPermissions.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const wrapper = await factory();

    expect(wrapper.text()).toContain('Loading effective permissions');
    resolveRequest?.(permissionResponse([]));
    await flushPromises();
    expect(wrapper.find('[data-test="permissions-empty"]').exists()).toBe(true);
  });
});
