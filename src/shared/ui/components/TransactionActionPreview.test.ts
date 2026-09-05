import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TransactionActionPreview from './TransactionActionPreview.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { Instruction as InstructionSchema, type Instruction } from '@/shared/api/schemas';

const { fetchInstructions } = vi.hoisted(() => ({ fetchInstructions: vi.fn() }));
vi.mock('@/shared/api', () => ({ fetchInstructions, getToriiBaseUrl: () => 'https://node.example' }));
const transactionHash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
const account = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const amount = '90071992547409931234567890.000000000000000001';
const multisigAccount = 'soraﾁｷVMXKﾏtKAoQﾅﾛ3qｾヱ8aﾄdNuｷﾀｱｽh9ｻtWﾐBﾒ9AﾏHｼQﾅvﾛﾌｹYﾑﾐﾛCﾎjtQQヰYCbﾎｵPfb6vXcﾖ1176ﾃﾈcﾐｲUEtﾎヱﾅｻﾀiuｦ2MPﾍﾏiﾌhﾓJｶｶgboCｻBpｷ35ｸ15ｼmGｲFK9NﾑoVﾜWvQMKﾃﾎB7ヰdM99EU4V';
const nestedTransfer = 'TlJUMAAAhip9dwddTSP/bBJh2wJ4EQDSAQAAAAAAABQKMDTp3Yu+Ag8OaXJvaGEudHJhbnNmZXLAA7gBAAAAAAAATlJUMAAApBdMeNY0H4+Y/Cra6O1nuQCQAQAAAAAAAOy4mMbcuTFWAgIAAACKA6oCggIBAAAA/AEBAQICAPUBAwAAAAAAAABOSiEAAAAAAAAAAQABhAExAb0BZQH/ASQBcwHNAacBpwEHAcEBgAH3AcEB5AH2AcQBzAGVASABPQFuAXoBJwFLAYUBswHtAW8BbAE1AgEATkohAAAAAAAAAAEAAbQBJgHPAXIBUQE3Af8B5gEzAbkB7gFJAXQBIAGoAYIB2gGYAW0BNgGxAfMBgQGPASEBkQFsAdUBtQH9AUoB/QIBAE5KIQAAAAAAAAABAAHHAeIB8QH8AZMBSQHvAZ8BkgG6AYEBeAFSAa4BbQGBAV0B2wGyAWABgQHUAWsBrQHiATMBSwERATwBHwF/AWUCAQAgAW4BFQFrAVABEAHmAUUB+AGDAesBgwEZAUYBuAGNAbgEAAAAAA0HAwAAAKCGAQQAAAAATwAAAABKIQAAAAAAAAABAAH9AVUB7wEWAZIB1QGPAYcBkwEvAVkBgAEhAbEB1gEWATkBRwGAAQgBIwHlAb4BuQF0AcoBiAEEAZoByAGaAfc=';
function instruction(index = 0, variant = 'Asset', hash = transactionHash) {
  return InstructionSchema.parse({
    authority: account, created_at: '2026-01-01T00:00:00Z', transaction_hash: hash,
    transaction_status: 'Committed', block: 42, index, kind: 'Transfer',
    box: { encoded: '0x01', framed_sha256: `0x${'c'.repeat(64)}`, json: {
      kind: 'Transfer', wire_id: 'iroha_data_model::isi::transfer::Transfer', encoded: '01',
      payload: { variant, value: { source: `66owaQmAQMuHxPzxUN3bqZ6FJfDa#${account}`, object: amount, destination: account } },
    } },
  });
}
function response(items: Instruction[] = [instruction()], more = false) {
  return { status: SUCCESSFUL_FETCHING, data: { items, pagination: { limit: 3, has_more: more, next_cursor: more ? 'next' : null, snapshot_height: 42, snapshot_hash: otherHash } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('TransactionActionPreview', () => {
  const wrappers: Array<ReturnType<typeof mount>> = [];
  function factory(rejected = false) {
    const wrapper = mount(TransactionActionPreview, {
      props: { transactionHash, rejected },
      global: { plugins: [i18n], stubs: { BaseLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }, BaseButton: { template: '<button><slot /></button>' }, BaseLoading: true } },
    });
    wrappers.push(wrapper);
    return wrapper;
  }
  beforeEach(() => { fetchInstructions.mockReset(); fetchInstructions.mockResolvedValue(response()); });
  afterEach(() => { while (wrappers.length) wrappers.pop()?.unmount(); });

  it('requests only the first three unfiltered instructions and preserves exact evidence and links', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchInstructions).toHaveBeenCalledExactlyOnceWith({ transaction_hash: transactionHash, cursor: null, limit: 3 });
    expect(wrapper.text()).toContain(amount);
    expect(wrapper.findAll('[data-test="instruction-semantic-card"]')).toHaveLength(1);
    expect(wrapper.get('a[href="#transaction-instructions"]').text()).toContain(i18n.global.t('ux.transaction.allInstructions'));
    expect(wrapper.find('[data-test="transaction-more-actions"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="transaction-rejected-actions"]').exists()).toBe(false);
  });

  it('labels rejected requests and relies on authoritative pagination to indicate more actions', async () => {
    fetchInstructions.mockResolvedValue(response([0, 1, 2].map((index) => ({ ...instruction(index), transaction_status: 'Rejected' })), true));
    const wrapper = factory(true);
    await flushPromises();
    expect(wrapper.get('[data-test="transaction-rejected-actions"]').text()).toContain(i18n.global.t('ux.transaction.rejectedActions'));
    expect(wrapper.findAll('[data-test="instruction-semantic-card"]')).toHaveLength(3);
    expect(wrapper.find('[data-test="transaction-more-actions"]').exists()).toBe(true);
    expect(fetchInstructions).toHaveBeenCalledTimes(1);
  });

  it('keeps decoded nested multisig instructions explicitly proposed when displaying a rejected request', async () => {
    const proposal = InstructionSchema.parse({
      ...instruction(),
      created_at: '2026-01-01T00:00:00Z',
      kind: 'Custom',
      transaction_status: 'Rejected',
      box: {
        encoded: '0x01',
        framed_sha256: `0x${'c'.repeat(64)}`,
        json: {
          kind: 'Custom',
          wire_id: 'iroha_data_model::isi::transparent::CustomInstruction',
          encoded: '01',
          payload: {
            variant: 'Custom',
            value: { Propose: { account: multisigAccount, instructions: [nestedTransfer], transaction_ttl_ms: null } },
          },
        },
      },
    });
    fetchInstructions.mockResolvedValue(response([proposal]));
    const wrapper = factory(true);
    await flushPromises();
    expect(wrapper.findAll('[data-test="instruction-semantic-card"]')).toHaveLength(1);
    expect(wrapper.get('.instruction-semantic-card__request').text()).toBe(i18n.global.t('studio.instructionPresentation.card.request'));
    expect(wrapper.get('[data-test="instruction-semantic-nested"] h5').text()).toBe(i18n.global.t('studio.instructionPresentation.card.proposedInstructions'));
    expect(wrapper.get('[data-test="instruction-semantic-nested-0"]').text()).toContain('100000');
    expect(wrapper.get('[data-test="transaction-rejected-actions"]').text()).toBe(i18n.global.t('ux.transaction.rejectedActions'));
    expect(fetchInstructions).toHaveBeenCalledTimes(1);
  });

  it('shows unsupported and empty evidence explicitly without constructing an action', async () => {
    fetchInstructions.mockResolvedValue(response([instruction(0, 'Unrecognized')]));
    const unsupported = factory();
    await flushPromises();
    expect(unsupported.find('[data-test="transaction-action-unavailable"]').exists()).toBe(true);
    expect(unsupported.find('[data-test="instruction-semantic-card"]').exists()).toBe(false);
    fetchInstructions.mockResolvedValue(response([]));
    const empty = factory();
    await flushPromises();
    expect(empty.find('[data-test="transaction-action-empty"]').exists()).toBe(true);
  });

  it('rejects instruction evidence belonging to a different transaction', async () => {
    fetchInstructions.mockResolvedValue(response([instruction(0, 'Asset', otherHash)]));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('[data-test="resource-retry"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="instruction-semantic-card"]').exists()).toBe(false);
  });

  it('exposes retry after failure and recovers using the same bounded request', async () => {
    fetchInstructions.mockRejectedValueOnce(new TypeError('offline'));
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.find('[data-test="instruction-semantic-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="transaction-action-empty"]').exists()).toBe(false);
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    await flushPromises();
    expect(fetchInstructions).toHaveBeenLastCalledWith({ transaction_hash: transactionHash, cursor: null, limit: 3 });
    expect(wrapper.find('[data-test="instruction-semantic-card"]').exists()).toBe(true);
  });

  it('clears old previews and ignores a late response when the transaction changes', async () => {
    const oldRequest = deferred<ReturnType<typeof response>>();
    fetchInstructions.mockReturnValueOnce(oldRequest.promise).mockResolvedValue(response([instruction(0, 'Unrecognized', otherHash)]));
    const wrapper = factory();
    await wrapper.setProps({ transactionHash: otherHash });
    await flushPromises();
    expect(wrapper.find('[data-test="transaction-action-unavailable"]').exists()).toBe(true);
    oldRequest.resolve(response());
    await flushPromises();
    expect(wrapper.find('[data-test="transaction-action-unavailable"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="instruction-semantic-card"]').exists()).toBe(false);
    expect(fetchInstructions).toHaveBeenLastCalledWith({ transaction_hash: otherHash, cursor: null, limit: 3 });
  });
});
