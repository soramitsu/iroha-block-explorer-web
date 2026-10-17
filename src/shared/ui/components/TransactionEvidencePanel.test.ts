import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionEvidencePanel from './TransactionEvidencePanel.vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const api = vi.hoisted(() => ({ fetchTransactionProof: vi.fn() }));
vi.mock('@/shared/api', () => api);
vi.mock('@/shared/runtime-config', () => ({ getRuntimeConfig: () => ({ networkId: 'network-a' }) }));
const hash = '11'.repeat(32);
const proof = {
  version: 1, network_id: 'network-a', block_height: '42', block_header: { height: '42' },
  transaction: { block_hash: '33'.repeat(32), entrypoint_hash: hash, output_hash: '55'.repeat(32),
    entrypoint_proof: { leaf_index: 0, audit_path: [] }, output_proof: { leaf_index: 0, audit_path: [] } },
  certificate: { consensus_header: 'aGVhZGVy', commit_qc: 'cWM=', result_preimage: 'cmVzdWx0' },
};
function mountPanel() {
  return mount(TransactionEvidencePanel, {
    props: { blockHeight: 42, transactionHash: hash },
    global: { mocks: { $t: (key: string) => key }, stubs: {
      BaseContentBlock: { template: '<section><slot name="header-action"/><slot /></section>' },
      BaseLoading: true,
      BaseButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
      DataField: { props: ['title', 'value', 'hash'], template: '<div>{{ title }}: {{ value ?? hash }}</div>' },
    } },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  api.fetchTransactionProof.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: proof });
});

describe('TransactionEvidencePanel', () => {
  it('shows selective paths and certificate with accurate identity-only claims', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(api.fetchTransactionProof).toHaveBeenCalledWith(hash);
    expect(wrapper.get('[data-test="transaction-proof-claim"]').text()).toBe('Identifiers match · finality not verified here');
    expect(wrapper.text()).toContain('does not independently verify Merkle paths');
    expect(JSON.parse(wrapper.get('[data-test="transaction-proof-raw"] pre').text())).toEqual(proof);
    expect(wrapper.text()).not.toContain('Block proof request failed');
  });

  it.each([
    ['transaction', { ...proof, transaction: { ...proof.transaction, entrypoint_hash: '77'.repeat(32) } }],
    ['network', { ...proof, network_id: 'network-b' }],
    ['height', { ...proof, block_height: '43' }],
  ])('reports a mismatched %s without claiming verification', async (_label, invalid) => {
    api.fetchTransactionProof.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: invalid });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.get('[data-test="transaction-proof-claim"]').text()).toBe('Evidence identity mismatch');
  });

  it('renders exact native integers above 2^53 without rounding or throwing', async () => {
    api.fetchTransactionProof.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: {
      ...proof, transaction: { ...proof.transaction, output: { dataspace_id: 8648377547929788715n } },
    } });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.get('[data-test="transaction-proof-raw"] pre').text()).toContain('"dataspace_id": 8648377547929788715');
  });

  it('explains unavailable private proofs and retries explicitly', async () => {
    api.fetchTransactionProof.mockResolvedValue({ status: NOT_FOUND });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.get('[data-test="transaction-proof-unavailable"]').text()).toContain('connect an authorized wallet');
    expect(wrapper.find('[data-test="transaction-proof-claim"]').exists()).toBe(false);
    await wrapper.get('[data-test="evidence-retry"]').trigger('click');
    expect(api.fetchTransactionProof).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed request explicit and retryable', async () => {
    api.fetchTransactionProof.mockResolvedValue({ status: UNKNOWN_ERROR, error: new Error('access denied') });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Transaction evidence could not be loaded');
    expect(wrapper.find('[data-test="transaction-proof-available"]').exists()).toBe(false);
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(api.fetchTransactionProof).toHaveBeenCalledTimes(2);
  });

  it('reloads for a different routed transaction', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const nextHash = '77'.repeat(32);
    await wrapper.setProps({ blockHeight: 43, transactionHash: nextHash });
    expect(api.fetchTransactionProof).toHaveBeenLastCalledWith(nextHash);
  });
});
