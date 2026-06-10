import {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  createConnectAppSession,
  createConnectSessionPreview as createUpstreamConnectSessionPreview,
  rewriteConnectUriProtocol,
} from '@iroha/iroha-js/connect-browser';
import { blake2b } from '@noble/hashes/blake2.js';
import type { BrowserConnectSessionPreview as ConnectSessionPreview } from '@iroha/iroha-js/connect-browser';

export {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  createConnectAppSession,
  rewriteConnectUriProtocol,
};

export type {
  BrowserConnectAppSession as ConnectAppSession,
  BrowserConnectApproval as ConnectApproval,
  BrowserConnectAppSessionOptions as ConnectAppSessionOptions,
  BrowserConnectBinaryLike as ConnectBinaryLike,
  BrowserConnectPermissions as ConnectPermissions,
} from '@iroha/iroha-js/connect-browser';
export type { ConnectSessionPreview };

type BinaryLike = Uint8Array | ArrayBuffer | ArrayBufferView;
const encoder = new TextEncoder();
const SID_PREFIX = encoder.encode('iroha-connect|sid|');

export interface ConnectSessionPreviewOptions {
  chainId: string
  node?: string | null
  nonce?: BinaryLike | null
  appPublicKey?: BinaryLike | null
  appKeyPair?: {
    publicKey: BinaryLike
    privateKey: BinaryLike
  } | null
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (normalized.length % 2 !== 0) throw new Error('hex string must have an even number of characters');

  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

const FINALIZED_TX_SIGNATURE_PREFIX = hexToBytes('5002000000000000480200000000000040000000000000000100000000000000');
const FINALIZED_TX_SIGNATURE_SLOT_SUFFIX = hexToBytes('0100000000000000');
const FINALIZED_TX_SUFFIX = hexToBytes('010000000000000000010000000000000000');

function toUint8Array(value: BinaryLike, name: string): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`${name} must be binary data`);
}

function requireNonEmptyString(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError(`${name} must not be empty`);
  return trimmed;
}

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function randomBytes(length: number): Uint8Array {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.getRandomValues) throw new Error('Web Crypto getRandomValues() is required for IrohaConnect');

  const output = new Uint8Array(length);
  cryptoImpl.getRandomValues(output);
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildConnectUri(sidBase64Url: string, chainId: string, node: string | null, role: 'app' | 'wallet'): string {
  const params = new URLSearchParams({
    sid: sidBase64Url,
    chain_id: chainId,
    v: '1',
    role,
  });

  if (node) params.set('node', node);
  return `iroha://connect?${params.toString()}`;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function u64ToLittleEndianBytes(value: number): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return buffer;
}

export function createConnectSessionPreview(options: ConnectSessionPreviewOptions): ConnectSessionPreview {
  const chainId = requireNonEmptyString(options.chainId, 'chainId');
  const node = normalizeOptionalString(options.node);

  if (options.appPublicKey) {
    const nonce = options.nonce ? toUint8Array(options.nonce, 'nonce') : randomBytes(16);
    const appPublicKey = toUint8Array(options.appPublicKey, 'appPublicKey');
    if (nonce.length !== 16) throw new RangeError(`nonce must be 16 bytes (received ${nonce.length})`);
    if (appPublicKey.length !== 32) {
      throw new RangeError(`appPublicKey must be 32 bytes (received ${appPublicKey.length})`);
    }

    const sidBytes = blake2b(concatBytes(SID_PREFIX, encoder.encode(chainId), appPublicKey, nonce), { dkLen: 32 });
    const sidBase64Url = toBase64Url(sidBytes);

    return {
      chainId,
      node,
      sidBytes,
      sidBase64Url,
      nonce,
      walletUri: buildConnectUri(sidBase64Url, chainId, node, 'wallet'),
      appUri: buildConnectUri(sidBase64Url, chainId, node, 'app'),
      wsUrl: node && /^https?:/u.test(node) ? buildConnectWebSocketUrl(node, sidBase64Url, 'app') : '',
      createdAt: Date.now(),
      appKeyPair: {
        publicKey: appPublicKey,
        privateKey: new Uint8Array(32),
      },
    } as unknown as ConnectSessionPreview;
  }

  return createUpstreamConnectSessionPreview({
    chainId,
    node,
    nonce: options.nonce ?? undefined,
    appKeyPair: options.appKeyPair
      ? {
        publicKey: toUint8Array(options.appKeyPair.publicKey, 'appKeyPair.publicKey'),
        privateKey: toUint8Array(options.appKeyPair.privateKey, 'appKeyPair.privateKey'),
      }
      : undefined,
  });
}

export function finalizeSignedTransaction(unsignedTxBytes: BinaryLike, detachedSignature: BinaryLike): Uint8Array {
  const payloadBytes = toUint8Array(unsignedTxBytes, 'unsignedTxBytes');
  const signatureBytes = toUint8Array(detachedSignature, 'detachedSignature');

  if (signatureBytes.length !== 64) {
    throw new Error(`detached signature must be a 64-byte Ed25519 signature (received ${signatureBytes.length})`);
  }

  const parts: Uint8Array[] = [FINALIZED_TX_SIGNATURE_PREFIX];
  for (let index = 0; index < signatureBytes.length; index += 1) {
    parts.push(Uint8Array.of(signatureBytes[index]));
    if (index < signatureBytes.length - 1) {
      parts.push(FINALIZED_TX_SIGNATURE_SLOT_SUFFIX);
    }
  }

  parts.push(u64ToLittleEndianBytes(payloadBytes.length), payloadBytes, FINALIZED_TX_SUFFIX);
  return concatBytes(...parts);
}
