import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ExplorerReadAccess from './ExplorerReadAccess.vue';
import { disconnectExplorerReadSession, explorerReadAccountId, explorerReadFailure, getExplorerReadAuth } from '@/shared/lib/explorer-read-auth';

const mocks = vi.hoisted(() => ({ register: vi.fn(), create: vi.fn(), authenticate: vi.fn() }));
const node = ref('https://taira.sora.org');
vi.mock('@/shared/api', () => ({ getToriiBaseUrl: () => node.value }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,test' } }));
vi.mock('@/shared/lib/connect', () => ({
  getConnectConfiguration: () => ({ available: true, literal: 'network-a', networkId: { toString: () => 'network-a' } }),
  createConnectSessionPreview: () => ({ sid: 'preview' }),
  registerConnectSession: (...args: unknown[]) => mocks.register(...args),
  createConnectAppSession: (...args: unknown[]) => mocks.create(...args),
  createConnectCanonicalRequestAuth: (...args: unknown[]) => mocks.authenticate(...args),
  TORII_CANONICAL_REQUEST_DOMAIN_TAG: 'torii-canonical-request',
}));
let wrapper: ReturnType<typeof mount> | undefined;
let socket: EventTarget;
let close: ReturnType<typeof vi.fn>;
function mountAccess() {
  wrapper = mount(ExplorerReadAccess, { global: { stubs: {
    BaseButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  } } });
  return wrapper;
}
async function start() {
  const view = mountAccess();
  await view.get('[data-test="read-access-toggle"]').trigger('click');
  await view.get('[data-test="read-access-connect"]').trigger('click');
  await vi.dynamicImportSettled();
  await flushPromises();
  return view;
}
beforeEach(() => {
  vi.clearAllMocks();
  disconnectExplorerReadSession();
  node.value = 'https://taira.sora.org';
  socket = new EventTarget();
  close = vi.fn();
  mocks.register.mockResolvedValue({ wallet_uri: 'iroha://connect/approved-session' });
  mocks.create.mockReturnValue({ socket, close });
  mocks.authenticate.mockResolvedValue({ authAccountId: 'reader@bpng', sign: vi.fn(async () => new Uint8Array([1])) });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; disconnectExplorerReadSession(); });

describe('Explorer Connect read access', () => {
  it('activates real wallet-approved identity and clears it on disconnect', async () => {
    const view = await start();
    expect(mocks.register).toHaveBeenCalledWith('https://taira.sora.org', expect.anything(), { node: 'https://taira.sora.org' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      permissions: { methods: ['sign_raw'], resources: ['torii-canonical-request'] },
    }));
    expect(view.get('[data-test="read-access-account"]').text()).toBe('reader@bpng');
    expect(getExplorerReadAuth(node.value, 'network-a')?.accountId).toBe('reader@bpng');
    await view.get('[data-test="read-access-disconnect"]').trigger('click');
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows a wallet deep link while waiting and ignores approval after cancellation', async () => {
    let approve!: (value: unknown) => void;
    mocks.authenticate.mockReturnValue(new Promise((resolve) => { approve = resolve; }));
    const view = await start();
    expect(view.get('[data-test="read-access-wallet"]').attributes('href')).toBe('iroha://connect/approved-session');
    expect(view.find('img').exists()).toBe(true);
    expect(explorerReadAccountId.value).toBeNull();
    await view.get('[data-test="read-access-cancel"]').trigger('click');
    approve({ authAccountId: 'late@bpng', sign: vi.fn() });
    await flushPromises();
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not grant access when wallet approval fails', async () => {
    mocks.authenticate.mockRejectedValue(new Error('Wallet rejected access'));
    const view = await start();
    expect(view.get('[role="alert"]').text()).toBe('Wallet rejected access');
    expect(explorerReadAccountId.value).toBeNull();
    expect(explorerReadFailure.value).toBeNull();
    expect(getExplorerReadAuth(node.value, 'network-a')).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['close', 'error'])('revokes access and blocks automatic public reads when the wallet emits %s', async (event) => {
    const view = await start();
    socket.dispatchEvent(new Event(event));
    await flushPromises();
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(view.get('[data-test="read-access-failure"]').text()).toContain('connection ended');
    expect(() => getExplorerReadAuth(node.value, 'network-a')).toThrow('connection ended');
    await view.get('[data-test="read-access-public"]').trigger('click');
    expect(getExplorerReadAuth(node.value, 'network-a')).toBeUndefined();
    expect(view.find('[role="alert"]').exists()).toBe(false);
  });

  it('revokes the session when the selected node changes', async () => {
    await start();
    node.value = 'https://other.example';
    await flushPromises();
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('preserves approved access across header navigation and revokes it from the next header', async () => {
    const view = await start();
    view.unmount();
    wrapper = undefined;
    expect(explorerReadAccountId.value).toBe('reader@bpng');
    expect(close).not.toHaveBeenCalled();
    const next = mountAccess();
    await next.get('[data-test="read-access-toggle"]').trigger('click');
    expect(next.get('[data-test="read-access-account"]').text()).toBe('reader@bpng');
    await next.get('[data-test="read-access-disconnect"]').trigger('click');
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('still revokes a detached header session when its wallet closes', async () => {
    const view = await start();
    view.unmount();
    wrapper = undefined;
    socket.dispatchEvent(new Event('close'));
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes a pending wallet request when its header is removed', async () => {
    let approve!: (value: unknown) => void;
    mocks.authenticate.mockReturnValue(new Promise((resolve) => { approve = resolve; }));
    const view = await start();
    view.unmount();
    wrapper = undefined;
    approve({ authAccountId: 'late@bpng', sign: vi.fn() });
    await flushPromises();
    expect(explorerReadAccountId.value).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
