import { computed, readonly, ref } from 'vue';
import type { ToriiBrowserCanonicalRequestAuth } from '@iroha/iroha-js/torii-browser';
import type { ConnectCanonicalRequestAuth } from './connect';

const revision = ref(0);
const accountId = ref<string | null>(null);
const failure = ref<string | null>(null);
export const explorerReadAuthRevision = readonly(revision);
export const explorerReadAccountId = readonly(accountId);
export const explorerReadFailure = readonly(failure);
export const explorerReadIsPublic = computed(() => accountId.value === null && failure.value === null);

interface ReadSession {
  baseUrl: string;
  networkId: string;
  auth: ToriiBrowserCanonicalRequestAuth;
  close: () => void;
  cancelSigning: () => void;
}
let session: ReadSession | null = null;

function endSession(reason: string | null): void {
  const previous = session;
  const previousFailure = failure.value;
  session = null;
  failure.value = reason;
  accountId.value = null;
  if (previous || previousFailure !== reason) revision.value += 1;
  if (previous) {
    previous.cancelSigning();
    previous.close();
  }
}

export function disconnectExplorerReadSession(): void {
  endSession(null);
}

/** Keep the wallet signer in memory and bind every signature to this session. */
export function activateExplorerReadSession(options: {
  baseUrl: string;
  networkId: string;
  auth: ConnectCanonicalRequestAuth;
  close: () => void;
}): (reason?: string) => void {
  disconnectExplorerReadSession();
  const basePath = new URL(options.baseUrl).pathname.replace(/\/+$/u, '');
  // Connect allows one wallet signature at a time, while a page can issue
  // several independent reads. Keep approval ordering local to this session.
  let signing = Promise.resolve();
  let queued = 0;
  let cancelSigning!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancelSigning = () => reject(new Error('The Explorer read session has ended.'));
  });
  // A session can end before any reads have subscribed to its cancellation.
  void cancelled.catch(() => {});
  const active: ReadSession = {
    baseUrl: options.baseUrl,
    networkId: options.networkId,
    close: options.close,
    cancelSigning,
    auth: Object.freeze({
      accountId: options.auth.authAccountId,
      ...(options.auth.nativeIdentity ? { nativeIdentity: options.auth.nativeIdentity } : {}),
      sign: async (input: Parameters<ToriiBrowserCanonicalRequestAuth['sign']>[0]) => {
        if (session !== active || input.networkId.toString() !== active.networkId) {
          throw new Error('The Explorer read session has ended or the network changed.');
        }
        const path = input.path.startsWith(`${basePath}/`) ? input.path.slice(basePath.length) : '';
        if (!path || (input.method !== 'GET' && !(input.method === 'POST' && /^\/v1\/.+\/query$/u.test(path)))) {
          throw new Error('The Explorer read session only signs ledger reads.');
        }
        if (queued >= 32) {
          const reason = 'Too many wallet read approvals are pending. Reconnect to continue private reads.';
          endSession(reason);
          throw new Error(reason);
        }
        // The SDK creates the signed timestamp before invoking this callback.
        // Include approval and queue time in the Explorer's 20-second budget.
        const remainingMs = 20_000 - Math.max(0, Date.now() - input.timestampMs);
        if (!Number.isFinite(remainingMs) || remainingMs <= 0) throw new Error('The wallet read approval expired. Refresh to create a new request.');
        queued += 1;
        let timeout!: ReturnType<typeof setTimeout>;
        const expired = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            const reason = 'The wallet read approval timed out. Reconnect to continue private reads.';
            reject(new Error(reason));
            if (session === active) endSession(reason);
          }, remainingMs);
        });
        const pending = signing.then(async () => {
          if (session !== active) throw new Error('The Explorer read session has ended.');
          const signature = await options.auth.sign(input);
          if (session !== active) throw new Error('The Explorer read session ended before signing completed.');
          return signature;
        });
        signing = pending.then(() => {}, () => {});
        try {
          return await Promise.race([pending, cancelled, expired]);
        } finally {
          clearTimeout(timeout);
          queued -= 1;
        }
      },
    }),
  };
  session = active;
  accountId.value = options.auth.authAccountId;
  revision.value += 1;
  return (reason) => {
    if (session === active) endSession(reason ?? null);
  };
}

export function getExplorerReadAuth(baseUrl: string, networkId: string | undefined): ToriiBrowserCanonicalRequestAuth | undefined {
  if (failure.value) throw new Error(failure.value);
  if (!session) return undefined;
  if (session.baseUrl !== baseUrl || session.networkId !== networkId) {
    disconnectExplorerReadSession();
    return undefined;
  }
  return session.auth;
}
