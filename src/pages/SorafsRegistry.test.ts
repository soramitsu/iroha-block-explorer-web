import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import SorafsRegistry from './SorafsRegistry.vue';
import { ensureLocaleLoaded, i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const scopeQueue = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => ref({ expose: scopeQueue.shift() }),
}));

vi.mock('@/shared/api', () => ({
  fetchSorafsPinRegistry: vi.fn(),
  fetchSorafsPinManifest: vi.fn(),
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  props: { title: { type: String, default: '' } },
  template: '<section><h2>{{ title }}</h2><slot name="header-action" /><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
    cursorPagination: { type: Object, default: null },
  },
  emits: ['click:row', 'update:cursor', 'update:page-size'],
  template: `
    <div class="base-table-stub" :data-next-cursor="cursorPagination?.next_cursor ?? ''">
      <slot name="header" />
      <button
        v-for="item in items"
        :key="item.digest"
        class="base-table-stub__row"
        type="button"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </button>
    </div>
  `,
});

const BaseHashStub = defineComponent({
  name: 'BaseHash',
  props: { hash: { type: String, default: '' } },
  template: '<code class="base-hash-stub">{{ hash }}</code>',
});

const BaseLinkStub = defineComponent({
  name: 'BaseLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
});

const DataFieldStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, default: '' },
    value: { type: [String, Number], default: null },
    hash: { type: String, default: '' },
  },
  template: '<div class="data-field-stub" :data-title="title">{{ hash || value }}</div>',
});

const BaseJsonStub = defineComponent({
  name: 'BaseJson',
  props: { value: { type: Object, required: true } },
  template: '<pre class="base-json-stub">{{ JSON.stringify(value) }}</pre>',
});

const DIGEST = '19'.repeat(32);
const BLOCK_HASH = 'ab'.repeat(32);
const NEXT_DIGEST = '20'.repeat(32);
const manifestSummary = {
  digest: DIGEST,
  submitted_by: 'sora-account',
  submitted_epoch: 4,
  approved_epoch: 5,
  content_length: 4096,
  retention_epoch: 99,
  status: { state: 'approved', epoch: 5 },
};
const pinPage = {
  finalized_cursor: { height: 42, block_hash: BLOCK_HASH },
  charged_usage: { manifest_count: 7, content_bytes: 8192 },
  manifests: [manifestSummary],
  has_more: true,
  next_after_digest: NEXT_DIGEST,
};
const exactManifest = {
  ...manifestSummary,
  root_cid: `01711f20${'cd'.repeat(32)}`,
  chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
  chunk_digest_sha3_256: '11'.repeat(32),
  por_root: '12'.repeat(32),
  policy: { min_replicas: 3, storage_class: 'hot', retention_epoch: 99 },
  alias: { namespace: 'sora', name: 'docs', proof: 'AA==' },
  metadata: { app: 'docs' },
  council_envelope_digest: null,
};

function mountPage() {
  return mount(SorafsRegistry, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseHash: BaseHashStub,
        BaseJson: BaseJsonStub,
        BaseLink: BaseLinkStub,
        BaseLoading: true,
        BaseTable: BaseTableStub,
        DataField: DataFieldStub,
      },
    },
  });
}

describe('SorafsRegistry', () => {
  beforeEach(async () => {
    await ensureLocaleLoaded('en');
    i18n.global.locale.value = 'en';
    scopeQueue.splice(0, scopeQueue.length);
  });

  it('renders the finalized keyset page and charged resource totals without retired registry surfaces', async () => {
    scopeQueue.push(
      {
        isLoading: false,
        data: { status: SUCCESSFUL_FETCHING, data: pinPage },
        refetch: vi.fn(),
      },
      { isLoading: false, data: undefined, refetch: vi.fn() }
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="sorafs-finalized-snapshot"]').text()).toContain('42');
    expect(wrapper.get('[data-testid="sorafs-finalized-snapshot"]').text()).toContain('8192');
    expect(wrapper.get('.base-table-stub').attributes('data-next-cursor')).toBe(NEXT_DIGEST);
    expect(wrapper.text()).toContain(DIGEST);
    expect(wrapper.text()).not.toContain('Bound aliases');
    expect(wrapper.text()).not.toContain('Replication orders');
    expect(wrapper.text()).not.toContain('IrohaConnect wallet');
  });

  it('loads the exact manifest view at the selected finalized snapshot', async () => {
    scopeQueue.push(
      {
        isLoading: false,
        data: { status: SUCCESSFUL_FETCHING, data: pinPage },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: { finalized_cursor: pinPage.finalized_cursor, manifest: exactManifest },
        },
        refetch: vi.fn(),
      }
    );

    const wrapper = mountPage();
    await wrapper.get('.base-table-stub__row').trigger('click');
    await flushPromises();

    const detail = wrapper.get('[data-testid="sorafs-manifest-detail"]');
    expect(detail.text()).toContain('sorafs.sf1@1.0.0');
    expect(detail.text()).toContain('hot');
    expect(detail.text()).toContain('sora.docs');
    expect(detail.get('.base-json-stub').text()).toContain('"app":"docs"');
  });

  it('retries an unanchored failed initial request when the snapshot refresh action is used', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    scopeQueue.push(
      {
        isLoading: false,
        data: { status: UNKNOWN_ERROR },
        refetch,
      },
      { isLoading: false, data: undefined, refetch: vi.fn() }
    );

    const wrapper = mountPage();
    expect(wrapper.get('[role="alert"]').text()).toContain('Unknown');
    await wrapper.get('[data-testid="sorafs-refresh-snapshot"]').trigger('click');
    await flushPromises();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
