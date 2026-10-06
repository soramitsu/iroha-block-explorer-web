import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionEvidencePanel from './TransactionEvidencePanel.vue';
import stateFinality from '../../../../tests/fixtures/taira-state-finality.json';
import { NOT_FOUND, SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const api = vi.hoisted(() => ({
  fetchLedgerBlockProof: vi.fn(),
  fetchBlock: vi.fn(),
  fetchLedgerStateRoot: vi.fn(),
  fetchLedgerStateProof: vi.fn(),
}));

vi.mock('@/shared/api', () => api);

const BLOCK_HEIGHT = stateFinality.height;
const TRANSACTION_HASH = '11'.repeat(32);
const ENTRY_ROOT = '33'.repeat(32);

const proof = {
  proof: {
    block_height: String(BLOCK_HEIGHT),
    block_hash: '44'.repeat(32),
    executed_block_wire_hash: '55'.repeat(32),
    entry_hash: TRANSACTION_HASH,
    entry_commitment: { root: ENTRY_ROOT, leaf_count: '1' },
    entry_proof: { leaf: TRANSACTION_HASH, proof: { leaf_index: 0, audit_path: [] } },
    result_commitment: { root: '66'.repeat(32), leaf_count: '1' },
    result_proof: { leaf: '77'.repeat(32), proof: { leaf_index: 0, audit_path: [] } },
    fastpq_transcripts: {},
  },
  pathVerification: null,
};

function mountPanel() {
  return mount(TransactionEvidencePanel, {
    props: { blockHeight: BLOCK_HEIGHT, transactionHash: TRANSACTION_HASH },
    global: {
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
        hash: stateFinality.block_hash.slice(5, 69).toLowerCase(),
        height: BLOCK_HEIGHT,
        created_at: new Date('2026-07-23T00:00:00Z'),
        prev_block_hash: 'hash:previous',
        transactions_hash: ENTRY_ROOT,
        transactions_rejected: 0,
        transactions_total: 1,
      },
    });
    api.fetchLedgerStateRoot.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: stateFinality });
    api.fetchLedgerStateProof.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: stateFinality });
  });

  it('keeps browser proof authentication unavailable while exposing decoded evidence', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-test="block-proof-available"]').text()).toContain('Not authenticated in this browser');
    expect(wrapper.get('[data-test="block-proof-claim"]').text()).toBe('Local verification incomplete');
    expect(wrapper.text()).toContain('does not independently authenticate Merkle paths');
    expect(wrapper.text()).not.toMatch(/wasm/iu);
    expect(wrapper.get('[data-test="reference-block-available"]').text()).toContain('Reference transactions root');
    expect(wrapper.text()).toContain('Node-provided · not cryptographically verified here');
    expect(wrapper.text()).toContain('Node-provided · finality not verified here');
    expect(wrapper.text()).toContain('identify the requested block');
    expect(wrapper.text()).toContain('Node-supplied block proof');
  });

  it('shows the current state-finality response without inventing quorum-certificate fields', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain(`Witnessed post-state root: ${stateFinality.witnessed_post_state_root}`);
    const fields = wrapper.get('[data-test="state-proof-available"]').text();
    expect(fields).toContain('Header height: 12');
    expect(fields).toContain('View-change index: 476');
    expect(fields).toContain('Committee entries: 4');
    expect(fields).toContain('Encoded block bytes: 16411');
    expect(fields).not.toContain('Signer bitmap');
    expect(wrapper.text()).not.toContain('Commit quorum certificate');
    expect(JSON.parse(wrapper.get('[data-test="state-proof-raw"] pre').text())).toEqual(stateFinality);
  });

  it('shows a block-proof authentication requirement while retaining public state evidence', async () => {
    api.fetchLedgerBlockProof.mockResolvedValue({
      status: UNKNOWN_ERROR,
      error: new Error('Block proofs require authenticated account access (HTTP 401).'),
    });
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('Block proofs require authenticated account access (HTTP 401).');
    expect(wrapper.find('[data-test="block-proof-claim"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="state-proof-available"]').text()).toContain('Committee entries: 4');
    expect(wrapper.text()).toContain('finality not verified here');
  });

  it('reports a state-finality failure without hiding the independently available state root', async () => {
    api.fetchLedgerStateProof.mockRejectedValue(new Error('state proof route failed'));
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('State-finality request failed: state proof route failed');
    expect(wrapper.text()).toContain(stateFinality.witnessed_post_state_root);
    expect(wrapper.find('[data-test="state-proof-raw"]').exists()).toBe(false);
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
    expect(wrapper.get('[data-test="reference-block-error"]').text()).toContain('reference route failed');
    expect(wrapper.get('[data-test="state-proof-unavailable"]').text()).toContain('No state finality evidence');
    expect(wrapper.text()).toContain('state route failed');
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
      data: { ...stateFinality, height: BLOCK_HEIGHT + 1, block_hash: 'hash:other-block' },
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain('do not identify the same requested block and witnessed post-state root');
  });

  it('warns when a state-finality block hash has an invalid checksum', async () => {
    api.fetchLedgerStateProof.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: { ...stateFinality, block_hash: stateFinality.block_hash.slice(0, -4) + '0000' },
    });
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('do not identify the same requested block and witnessed post-state root');
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
