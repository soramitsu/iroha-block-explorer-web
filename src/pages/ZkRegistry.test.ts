import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ZkRegistry from './ZkRegistry.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const api = vi.hoisted(() => ({
  fetchZkProofs: vi.fn(),
  fetchZkProofCount: vi.fn(),
  fetchZkProof: vi.fn(),
  fetchZkVerifyingKeys: vi.fn(),
  fetchZkVerifyingKey: vi.fn(),
}));

vi.mock('@/shared/api', () => api);

const proofHash = 'ab'.repeat(32);
const proofRow = {
  backend: 'halo2/ipa',
  hash: proofHash,
  status: 'Verified' as const,
  verified_at_height: 44,
  vk_ref: { backend: 'halo2/ipa', name: 'transfer-v1' },
  vk_commitment: 'cd'.repeat(32),
  bridge: {
    binding: { kind: 'verifier_manifest' as const, hash: '01'.repeat(32) },
    commitment: '02'.repeat(32),
    size_bytes: 256,
    range: { start_height: 20, end_height: 30 },
    payload: {
      kind: 'transparent_zk' as const,
      backend: 'halo2/ipa',
      proof_len_bytes: 128,
      recursion_depth: 2,
    },
  },
};

const verifyingKeyRecord = {
  version: 1,
  circuit_id: 'transfer-v1',
  owner_manifest_id: null,
  namespace: 'core',
  backend: 'Halo2IpaPasta',
  curve: 'pallas',
  public_inputs_schema_hash: '11'.repeat(32),
  commitment: '22'.repeat(32),
  vk_len: 128,
  max_proof_bytes: 4096,
  gas_schedule_id: 'default',
  metadata_uri_cid: null,
  vk_bytes_cid: 'bafy-vk',
  activation_height: 10,
  withdraw_height: null,
  status: 'Active' as const,
  key: { backend: 'halo2/ipa', bytes_b64: 'AQIDBA==' },
};

const BaseContentBlockStub = {
  name: 'BaseContentBlock',
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items', 'loading'],
  emits: ['click:row', 'update:page', 'update:pageSize'],
  template: `
    <div>
      <slot name="header" />
      <button
        v-for="(item, index) in items"
        :key="index"
        :data-testid="item.hash ? 'proof-row' : 'vk-row'"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </button>
    </div>
  `,
};

const BaseButtonStub = {
  name: 'BaseButton',
  props: ['disabled', 'nativeType'],
  template: '<button :type="nativeType || \'button\'" :disabled="disabled"><slot /></button>',
};

const BaseHashStub = {
  name: 'BaseHash',
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const DataFieldStub = {
  name: 'DataField',
  props: ['title', 'value', 'hash'],
  template: '<div><strong>{{ title }}</strong><span>{{ hash || value }}</span></div>',
};

const BaseJsonStub = {
  name: 'BaseJson',
  props: ['value'],
  template: '<pre>{{ JSON.stringify(value) }}</pre>',
};

const BaseLoadingStub = { name: 'BaseLoading', template: '<span>loading</span>' };

function mountPage() {
  return mount(ZkRegistry, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseHash: BaseHashStub,
        BaseJson: BaseJsonStub,
        BaseLoading: BaseLoadingStub,
        BaseTable: BaseTableStub,
        DataField: DataFieldStub,
      },
    },
  });
}

describe('ZkRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchZkProofs.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: [proofRow] });
    api.fetchZkProofCount.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: { count: 1 } });
    api.fetchZkProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...proofRow, proof_hash: proofRow.hash, hash: undefined },
    });
    api.fetchZkVerifyingKeys.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: [{ id: { backend: 'halo2/ipa', name: 'transfer-v1' }, record: verifyingKeyRecord }],
    });
    api.fetchZkVerifyingKey.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        id: { backend: 'halo2/ipa', name: 'transfer-v1' },
        record: verifyingKeyRecord,
        record_norito_base64: 'Tk9SSVRP',
      },
    });
  });

  it('loads only the current proof/count and verifying-key registry snapshots', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(api.fetchZkProofs).toHaveBeenCalledWith({ limit: 20, offset: 0, order: 'desc' });
    expect(api.fetchZkProofCount).toHaveBeenCalledWith({});
    expect(api.fetchZkVerifyingKeys).toHaveBeenCalledWith({ limit: 25, offset: 0, order: 'asc' });
    expect(wrapper.text()).toContain('Proof registry');
    expect(wrapper.text()).toContain('Verifying-key registry');
    expect(wrapper.text()).toContain(proofHash);
    expect(wrapper.text()).not.toContain('Proof stream');
    expect(wrapper.text()).not.toContain('attachments');
    expect(wrapper.text()).not.toContain('Prover reports');
  });

  it('validates the exact four-byte proof tag, applies canonical filters, and loads proof detail on selection', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const form = wrapper.get('[data-testid="zk-proof-filters"]');
    const inputs = form.findAll('input');
    const selects = form.findAll('select');

    await inputs[1]!.setValue('BAD');
    expect(wrapper.text()).toContain('exactly four printable ASCII characters');
    expect(wrapper.get('[data-testid="zk-proof-apply"]').attributes('disabled')).toBeDefined();
    expect(api.fetchZkProofs).toHaveBeenCalledTimes(1);

    await inputs[0]!.setValue('halo2/ipa');
    await inputs[1]!.setValue('PROF');
    await selects[0]!.setValue('Verified');
    await selects[1]!.setValue('asc');
    await selects[2]!.setValue('true');
    await form.trigger('submit');
    await flushPromises();

    expect(api.fetchZkProofs).toHaveBeenLastCalledWith({
      backend: 'halo2/ipa',
      status: 'Verified',
      bridge_only: true,
      has_tag: 'PROF',
      limit: 20,
      offset: 0,
      order: 'asc',
    });
    expect(api.fetchZkProofCount).toHaveBeenLastCalledWith({
      backend: 'halo2/ipa',
      status: 'Verified',
      bridge_only: true,
      has_tag: 'PROF',
    });

    await wrapper.get('[data-testid="proof-row"]').trigger('click');
    await flushPromises();
    expect(api.fetchZkProof).toHaveBeenCalledWith('halo2/ipa', proofHash);
    expect(wrapper.get('[data-testid="zk-proof-detail"]').text()).toContain('Bridge proof metadata');
  });

  it('applies current verifying-key filters, advances bounded offset pagination, and loads exact detail', async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      id: { backend: 'halo2/ipa', name: `transfer-${index}` },
      record: verifyingKeyRecord,
    }));
    const secondPage = [{ id: { backend: 'halo2/ipa', name: 'transfer-25' }, record: verifyingKeyRecord }];
    api.fetchZkVerifyingKeys.mockImplementation(async (params: { offset?: number }) => ({
      status: SUCCESSFUL_FETCHING,
      data: params.offset === 0 ? firstPage : secondPage,
    }));
    const wrapper = mountPage();
    await flushPromises();
    const form = wrapper.get('[data-testid="zk-vk-filters"]');
    const inputs = form.findAll('input');
    const selects = form.findAll('select');

    await inputs[0]!.setValue('halo2/ipa');
    await inputs[1]!.setValue('transfer');
    await selects[0]!.setValue('Active');
    await selects[1]!.setValue('desc');
    await form.trigger('submit');
    await flushPromises();

    expect(api.fetchZkVerifyingKeys).toHaveBeenLastCalledWith({
      backend: 'halo2/ipa',
      status: 'Active',
      name_contains: 'transfer',
      order: 'desc',
      limit: 25,
      offset: 0,
    });

    await wrapper.get('[data-testid="zk-vk-next"]').trigger('click');
    await flushPromises();
    expect(api.fetchZkVerifyingKeys).toHaveBeenLastCalledWith({
      backend: 'halo2/ipa',
      status: 'Active',
      name_contains: 'transfer',
      order: 'desc',
      limit: 25,
      offset: 25,
    });

    await wrapper.get('[data-testid="vk-row"]').trigger('click');
    await flushPromises();
    expect(api.fetchZkVerifyingKey).toHaveBeenCalledWith('halo2/ipa', 'transfer-25');
    expect(wrapper.get('[data-testid="zk-vk-detail"]').text()).toContain('Canonical Norito record');
  });
});
