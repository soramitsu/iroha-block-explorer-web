import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateExplorerReadSession, disconnectExplorerReadSession, explorerReadAccountId,
  explorerReadAuthRevision, getExplorerReadAuth,
  explorerReadFailure, explorerReadIsPublic,
} from './explorer-read-auth';

const baseUrl = 'https://taira.sora.org';
const networkId = 'network-a';
const input = { method: 'GET', path: '/v1/explorer/transactions/hash/proof', networkId: { toString: () => networkId }, get timestampMs() { return Date.now(); } } as any;
function activate(sign = vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([1, 2]))) {
  const close = vi.fn();
  activateExplorerReadSession({ baseUrl, networkId, auth: { authAccountId: 'reader@bpng', sign }, close });
  return { sign, close, auth: getExplorerReadAuth(baseUrl, networkId)! };
}
afterEach(() => { disconnectExplorerReadSession(); vi.useRealTimers(); });

describe('Explorer wallet read session', () => {
  it('uses the approved account signer for exact-network GET and collection reads', async () => {
    const revision = explorerReadAuthRevision.value;
    const { auth, sign } = activate();
    expect(explorerReadAuthRevision.value).toBeGreaterThan(revision);
    expect(explorerReadAccountId.value).toBe('reader@bpng');
    expect(auth.accountId).toBe('reader@bpng');
    await expect(auth.sign(input)).resolves.toEqual(new Uint8Array([1, 2]));
    await auth.sign({ ...input, method: 'POST', path: '/v1/explorer/transactions/query' });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('authorizes canonical read paths under the configured Torii base prefix without changing signed bytes', async () => {
    const sign = vi.fn(async () => new Uint8Array([1]));
    const prefixedBase = `${baseUrl}/ledger/gateway`;
    activateExplorerReadSession({ baseUrl: prefixedBase, networkId,
      auth: { authAccountId: 'reader@bpng', sign }, close: vi.fn() });
    const auth = getExplorerReadAuth(prefixedBase, networkId)!;
    const request = { ...input, method: 'POST', path: '/ledger/gateway/v1/explorer/transactions/query' };
    await auth.sign(request);
    expect(sign).toHaveBeenCalledWith(request);
    await expect(auth.sign({ ...request, path: '/v1/explorer/transactions/query' })).rejects.toThrow('only signs ledger reads');
  });

  it.each([
    ['origin', 'https://another-node.example', networkId],
    ['network', baseUrl, 'network-b'],
    ['missing identity', baseUrl, undefined],
  ])('revokes credentials on a changed %s', (_label, url, network) => {
    const { close } = activate();
    expect(getExplorerReadAuth(url!, network)).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(explorerReadAccountId.value).toBeNull();
  });

  it('does not sign writes, a different network, or use a revoked signer', async () => {
    const { auth, sign, close } = activate();
    await expect(auth.sign({ ...input, method: 'POST', path: '/v1/transactions' })).rejects.toThrow('only signs ledger reads');
    await expect(auth.sign({ ...input, networkId: { toString: () => 'other' } })).rejects.toThrow('network changed');
    disconnectExplorerReadSession();
    await expect(auth.sign(input)).rejects.toThrow('session has ended');
    expect(sign).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('discards a signature if the wallet disconnected while approval was pending', async () => {
    let resolve!: (value: Uint8Array) => void;
    const { auth } = activate(vi.fn(() => new Promise<Uint8Array>((done) => { resolve = done; })));
    const signature = auth.sign(input);
    await Promise.resolve();
    disconnectExplorerReadSession();
    resolve(new Uint8Array([1]));
    await expect(signature).rejects.toThrow('session has ended');
  });

  it('serializes parallel page reads without poisoning the queue after a rejected approval', async () => {
    let rejectFirst!: (reason: Error) => void;
    const sign = vi.fn<() => Promise<Uint8Array>>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(new Uint8Array([2]));
    const { auth } = activate(sign);
    const first = auth.sign(input);
    const firstRejected = expect(first).rejects.toThrow('Approval rejected');
    const second = auth.sign({ ...input, path: '/v1/explorer/transactions/query', method: 'POST' });
    await Promise.resolve();
    expect(sign).toHaveBeenCalledOnce();
    rejectFirst(new Error('Approval rejected'));
    await firstRejected;
    await expect(second).resolves.toEqual(new Uint8Array([2]));
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('revokes queued reads before asking the wallet to sign them', async () => {
    let resolveFirst!: (value: Uint8Array) => void;
    const sign = vi.fn(() => new Promise<Uint8Array>((resolve) => { resolveFirst = resolve; }));
    const { auth } = activate(sign);
    const first = auth.sign(input);
    const second = auth.sign(input);
    const failures = Promise.all([
      expect(first).rejects.toThrow('session has ended'),
      expect(second).rejects.toThrow('session has ended'),
    ]);
    await Promise.resolve();
    disconnectExplorerReadSession();
    resolveFirst(new Uint8Array([1]));
    await failures;
    expect(sign).toHaveBeenCalledOnce();
  });

  it('rejects queued and active calls immediately when the wallet never settles and the reader disconnects', async () => {
    const sign = vi.fn(() => new Promise<Uint8Array>(() => {}));
    const { auth } = activate(sign);
    const first = auth.sign(input);
    const second = auth.sign(input);
    await Promise.resolve();
    disconnectExplorerReadSession();
    await expect(first).rejects.toThrow('session has ended');
    await expect(second).rejects.toThrow('session has ended');
    expect(sign).toHaveBeenCalledOnce();
  });

  it('expires the session before queued signed timestamps can become stale', async () => {
    vi.useFakeTimers();
    const sign = vi.fn(() => new Promise<Uint8Array>(() => {}));
    const { auth, close } = activate(sign);
    const pending = auth.sign(input);
    const rejection = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
    expect(close).toHaveBeenCalledOnce();
    expect(explorerReadAccountId.value).toBeNull();
    expect(explorerReadFailure.value).toContain('timed out');
    expect(explorerReadIsPublic.value).toBe(false);
    expect(() => getExplorerReadAuth(baseUrl, networkId)).toThrow('timed out');
    const failedRevision = explorerReadAuthRevision.value;
    disconnectExplorerReadSession();
    expect(explorerReadAuthRevision.value).toBeGreaterThan(failedRevision);
    expect(explorerReadIsPublic.value).toBe(true);
    expect(getExplorerReadAuth(baseUrl, networkId)).toBeUndefined();
  });

  it('rejects already expired timestamps without prompting the wallet', async () => {
    const { auth, sign } = activate();
    await expect(auth.sign({ ...input, timestampMs: Date.now() - 20_001 })).rejects.toThrow('expired');
    expect(sign).not.toHaveBeenCalled();
  });

  it('bounds the approval queue and preserves the exact native identity object', async () => {
    const nativeIdentity = Object.freeze({ accountId: 'reader@bpng' });
    const sign = vi.fn(() => new Promise<Uint8Array>(() => {}));
    activateExplorerReadSession({ baseUrl, networkId,
      auth: { authAccountId: 'reader@bpng', sign, nativeIdentity: nativeIdentity as any }, close: vi.fn() });
    const auth = getExplorerReadAuth(baseUrl, networkId)!;
    expect(auth.nativeIdentity).toBe(nativeIdentity);
    const pending = Array.from({ length: 32 }, () => auth.sign(input));
    const settled = Promise.allSettled(pending);
    await expect(auth.sign(input)).rejects.toThrow('Too many wallet read approvals');
    disconnectExplorerReadSession();
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true);
  });

  it('does not let an old wallet socket revoke a newer session', () => {
    const oldClose = vi.fn();
    const revokeOld = activateExplorerReadSession({ baseUrl, networkId,
      auth: { authAccountId: 'old@bank', sign: vi.fn() }, close: oldClose });
    activate();
    expect(oldClose).toHaveBeenCalledOnce();
    revokeOld();
    expect(explorerReadAccountId.value).toBe('reader@bpng');
  });
});
