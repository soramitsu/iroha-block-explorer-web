import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionEvidencePanel from './TransactionEvidencePanel.vue';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { i18n } from '@/shared/lib/localization';

const api = vi.hoisted(() => ({
  fetchLedgerBlockProof: vi.fn(),
  fetchBlock: vi.fn(),
  fetchLedgerStateRoot: vi.fn(),
  fetchLedgerStateProof: vi.fn(),
}));

vi.mock('@/shared/api', () => api);

const TRANSACTION_HASH = '11'.repeat(32);
const ENTRY_ROOT = '33'.repeat(32);

const proof = {
  proof: {
    block_height: '42',
    block_hash: '22'.repeat(32),
    executed_block_wire_hash: '44'.repeat(32),
    entry_hash: TRANSACTION_HASH,
    entry_commitment: { root: ENTRY_ROOT, leaf_count: '1' },
    entry_proof: { leaf: TRANSACTION_HASH, proof: { leaf_index: 0, audit_path: [] } },
    result_commitment: { root: '55'.repeat(32), leaf_count: '1' },
    result_proof: { leaf: '66'.repeat(32), proof: { leaf_index: 0, audit_path: [] } },
    fastpq_transcripts: {},
  },
  pathVerification: {
    valid: true,
    entry_hash_matches: true,
    entry_proof_valid: true,
    result_proof_valid: true,
  },
};

const qc = {
  phase: 'Commit',
  subject_block_hash: 'hash:block',
  parent_state_root: 'hash:parent',
  post_state_root: 'hash:state',
  height: 42,
  view: 7,
  epoch: 3,
  mode_tag: 'sumeragi-v2',
  highest_qc: null,
  validator_set_hash: 'hash:validators',
  validator_set_hash_version: 1,
  validator_set: ['peer-a', 'peer-b'],
  aggregate: {
    signers_bitmap: '03',
    bls_aggregate_signature: 'cafe',
  },
};

function mountPanel() {
  return mount(TransactionEvidencePanel, {
    props: { blockHeight: 42, transactionHash: TRANSACTION_HASH },
    global: {
      plugins: [i18n],
      stubs: {
        BaseContentBlock: {
          template: '<section><slot name="header-action"/><slot /></section>',
        },
        BaseResourceState: {
          props: ['snapshot'],
          emits: ['retry'],
          template: '<div><slot /></div>',
        },
        DataField: {
          props: ['title', 'value', 'hash'],
          template: '<div class="field">{{ title }}: {{ value ?? hash }}</div>',
        },
        BaseButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
}

describe('TransactionEvidencePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLedgerBlockProof.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: proof });
    api.fetchBlock.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        hash: 'hash:block',
        height: 42,
        created_at: new Date('2026-07-23T00:00:00Z'),
        prev_block_hash: 'hash:previous',
        transactions_hash: ENTRY_ROOT,
        transactions_rejected: 0,
        transactions_total: 1,
      },
    });
    api.fetchLedgerStateRoot.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        source: 'commit_qc',
        commit_qc: qc,
      },
    });
    api.fetchLedgerStateProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { height: 42, block_hash: 'hash:block', state_root: 'hash:state', commit_qc: qc },
    });
  });

  it('distinguishes locally verified Merkle evidence from node-provided state and QC claims', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-available"]').text()).toContain(
      'Internally valid against proof entry root'
    );
    expect(wrapper.get('[data-test="block-proof-claim"]').text()).toBe('Transaction entry locally verified');
    expect(wrapper.text()).toContain('result root supplied in the same proof');
    expect(wrapper.text()).toContain('that root is not independently anchored here');
    expect(wrapper.get('[data-test="reference-block-available"]').text()).toContain('Reference transactions root');
    expect(wrapper.text()).toContain('Node-provided · not cryptographically verified here');
    expect(wrapper.text()).toContain('Node-provided · BLS not verified here');
    expect(wrapper.text()).toContain('identify the requested block');
    expect(wrapper.text()).toContain('Canonical decoded proof');
  });

  it('keeps unavailable and failed evidence explicit and retries only on user action', async () => {
    api.fetchLedgerBlockProof.mockResolvedValue({ status: NOT_FOUND });
    api.fetchBlock.mockRejectedValue(new TypeError('reference route failed'));
    api.fetchLedgerStateRoot.mockResolvedValue({
      status: UNKNOWN_ERROR,
      error: new Error('state route failed'),
    });
    api.fetchLedgerStateProof.mockResolvedValue({ status: NOT_FOUND });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-unavailable"]').text()).toContain('no block proof');
    expect(wrapper.get('[data-test="reference-block-error"]').text()).toContain('reference-block request failed');
    expect(wrapper.get('[data-test="state-proof-unavailable"]').text()).toContain('No persisted');
    expect(wrapper.text()).toContain('state-root request failed');
    expect(api.fetchLedgerBlockProof).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-test="evidence-retry"]').trigger('click');
    await flushPromises();
    expect(api.fetchLedgerBlockProof).toHaveBeenCalledTimes(2);
  });

  it('does not claim local verification for an internally valid proof bound to another transaction', async () => {
    api.fetchLedgerBlockProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...proof,
        proof: { ...proof.proof, entry_hash: '55'.repeat(32) },
      },
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-claim"]').text()).toBe('Local verification failed');
    expect(wrapper.get('[data-test="block-proof-available"]').text()).toContain('Does not match proof entry');
  });

  it('keeps a proof visible but marks verification incomplete without a reference block', async () => {
    api.fetchBlock.mockResolvedValue({ status: NOT_FOUND });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-available"]').text()).toContain('Could not be checked');
    expect(wrapper.get('[data-test="block-proof-claim"]').text()).toBe('Local verification incomplete');
    expect(wrapper.get('[data-test="reference-block-unavailable"]').text()).toContain('cannot be bound');
  });

  it('reports a conclusive transaction mismatch as failed even without a reference block', async () => {
    api.fetchLedgerBlockProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ...proof,
        proof: { ...proof.proof, entry_hash: '55'.repeat(32) },
      },
    });
    api.fetchBlock.mockResolvedValue({ status: NOT_FOUND });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-claim"]').text()).toBe('Local verification failed');
    expect(wrapper.get('[data-test="block-proof-available"]').text()).toContain('Does not match proof entry');
  });

  it('warns when state responses share a root but identify different blocks', async () => {
    api.fetchLedgerStateProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { height: 43, block_hash: 'hash:other-block', state_root: 'hash:state', commit_qc: qc },
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('do not identify the same requested block and state root');
  });

  it('reloads evidence when the routed transaction identity changes', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const nextTransactionHash = '55'.repeat(32);
    await wrapper.setProps({ blockHeight: 43, transactionHash: nextTransactionHash });
    await flushPromises();

    expect(api.fetchLedgerBlockProof).toHaveBeenLastCalledWith(43, nextTransactionHash);
    expect(api.fetchBlock).toHaveBeenLastCalledWith(43);
    expect(api.fetchLedgerStateRoot).toHaveBeenLastCalledWith(43);
    expect(api.fetchLedgerStateProof).toHaveBeenLastCalledWith(43);
  });
});
