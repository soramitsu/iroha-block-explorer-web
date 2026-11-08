import nativeInstruction from '../../../../tests/fixtures/taira-ce5-log-instruction.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TransactionActionPreview from './TransactionActionPreview.vue';
import { i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import { Instruction as InstructionSchema, type Instruction } from '@/shared/api/schemas';

const { fetchInstructions } = vi.hoisted(() => ({ fetchInstructions: vi.fn() }));
vi.mock('@/shared/runtime-config', () => ({ getRuntimeNetworkPrefix: () => 369 }));
vi.mock('@/shared/api', () => ({ fetchInstructions, getToriiBaseUrl: () => 'https://node.example' }));
const transactionHash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
const account = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
function instruction(index = 0, _variant = 'Asset', hash = transactionHash) {
  return InstructionSchema.parse({ ...nativeInstruction, transaction_hash: hash, index });
}
function response(items: Instruction[] = [instruction()], more = false) {
  return { status: SUCCESSFUL_FETCHING, data: { items, nextCursor: more ? 'next' : null } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('TransactionActionPreview', () => {
  const wrappers: Array<ReturnType<typeof mount>> = [];
  function factory(rejected = false) {
    const wrapper = mount(TransactionActionPreview, {
      props: { transactionHash, rejected },
      global: {
        plugins: [i18n],
        stubs: {
          BaseLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
          BaseButton: { template: '<button><slot /></button>' },
          BaseLoading: true,
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  }
  beforeEach(() => {
    fetchInstructions.mockReset();
    fetchInstructions.mockResolvedValue(response());
  });
  afterEach(() => {
    while (wrappers.length) wrappers.pop()?.unmount();
  });

  it('requests only the first three instructions and preserves the authoritative opaque-evidence boundary', async () => {
    const wrapper = factory();
    await flushPromises();
    expect(fetchInstructions).toHaveBeenCalledExactlyOnceWith({
      transaction_hash: transactionHash,
      cursor: null,
      limit: 3,
    });
    expect(wrapper.findAll('[data-test="transaction-action-unavailable"]')).toHaveLength(1);
    expect(wrapper.get('a[href="#transaction-instructions"]').text()).toContain(
      i18n.global.t('ux.transaction.allInstructions')
    );
    expect(wrapper.find('[data-test="transaction-more-actions"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="transaction-rejected-actions"]').exists()).toBe(false);
  });

  it('labels rejected requests and relies on authoritative pagination to indicate more actions', async () => {
    fetchInstructions.mockResolvedValue(
      response(
        [0, 1, 2].map((index) => ({ ...instruction(index), transaction_status: 'Rejected' })),
        true
      )
    );
    const wrapper = factory(true);
    await flushPromises();
    expect(wrapper.get('[data-test="transaction-rejected-actions"]').text()).toContain(
      i18n.global.t('ux.transaction.rejectedActions')
    );
    expect(wrapper.findAll('[data-test="transaction-action-unavailable"]')).toHaveLength(3);
    expect(wrapper.find('[data-test="transaction-more-actions"]').exists()).toBe(true);
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
    expect(wrapper.find('[data-test="transaction-action-unavailable"]').exists()).toBe(true);
  });

  it('clears old previews and ignores a late response when the transaction changes', async () => {
    const oldRequest = deferred<ReturnType<typeof response>>();
    fetchInstructions
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValue(response([instruction(0, 'Unrecognized', otherHash)]));
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
