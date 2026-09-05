import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import AccountPermissionsView from './AccountPermissionsView.vue';
import { i18n } from '@/shared/lib/localization';

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
    total: { type: Number, default: 0 },
  },
  emits: ['update:page', 'update:page-size'],
  template: `
    <div class="base-table-stub" :data-total="total">
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

function permissionResponse(items: Record<string, unknown>[], total = items.length) {
  return {
    status: 'ok',
    data: {
      items,
      total,
      has_more: false,
      count_mode: 'exact',
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
      plugins: [router, i18n],
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
      permissionResponse(
        [
          {
            name: 'CanTransferAsset',
            payload: {
              asset: 'rose#wonderland',
              ceiling: '90071992547409931234567890.000000000000000001',
              nested: { dataspace: 'private-settlement' },
            },
          },
        ],
        101
      )
    );

    const wrapper = await factory({ permissions_page: '3', permissions_per_page: '50' });

    expect(apiMocks.fetchAccountPermissions).toHaveBeenCalledWith(ACCOUNT, { page: 3, per_page: 50 });
    expect(wrapper.text()).toContain('CanTransferAsset');
    expect(wrapper.text()).toContain('90071992547409931234567890.000000000000000001');
    expect(wrapper.text()).toContain('private-settlement');
    expect(wrapper.get('.base-table-stub').attributes('data-total')).toBe('101');
    expect(wrapper.get('[data-test="permissions-provenance-notice"]').text()).toContain(
      'does not provide per-entry provenance'
    );
    expect(wrapper.get('[data-test="permissions-provenance-notice"]').text()).toContain(
      'direct grants and permissions inherited from assigned roles'
    );
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
      'could not be loaded',
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

  it('rejects malformed URL pagination without calling Torii', async () => {
    const wrapper = await factory({ permissions_page: '0', permissions_per_page: '30' });

    expect(apiMocks.fetchAccountPermissions).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="permissions-invalid-pagination"]').text()).toContain('first 500 matching rows');
    expect(wrapper.text()).toContain('Reset pagination');
  });

  it('keeps the table recovery controls for an empty page beyond a nonzero total', async () => {
    apiMocks.fetchAccountPermissions.mockResolvedValue(permissionResponse([], 7));

    const wrapper = await factory({ permissions_page: '2' });

    expect(wrapper.find('[data-test="permissions-empty"]').exists()).toBe(false);
    expect(wrapper.get('.base-table-stub').attributes('data-total')).toBe('7');
  });

  it('shows initial loading until the first response settles', async () => {
    let resolveRequest: ((value: ReturnType<typeof permissionResponse>) => void) | undefined;
    apiMocks.fetchAccountPermissions.mockImplementation(
      () =>
        new Promise((resolve) => {
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
