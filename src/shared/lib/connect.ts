import * as connectBrowserSdk from '@iroha/iroha-js/connect-browser';
import { ToriiBrowserClient, type NativeAccountIdentity } from '@iroha/iroha-js/torii-browser';
import { getRuntimeConfig } from '@/shared/runtime-config';

export {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  rewriteConnectUriProtocol,
  TORII_CANONICAL_REQUEST_DOMAIN_TAG,
} from '@iroha/iroha-js/connect-browser';

export type ConnectBinaryLike = Uint8Array | ArrayBuffer | ArrayBufferView | number[] | string;
type BinaryLike = Uint8Array | ArrayBuffer | ArrayBufferView;

export interface ConnectNetworkId {
  readonly literal: string
  toBytes: () => Uint8Array
  toString: () => string
}

export interface ConnectKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export interface ConnectSessionPreview {
  networkId: ConnectNetworkId
  node: string | null
  sidBytes: Uint8Array
  sidBase64Url: string
  nonce: Uint8Array
  appKeyPair: ConnectKeyPair
  walletUri: string
  appUri: string
  wsUrl: string
  createdAt: number
}

export interface ConnectSessionResponse {
  sid: string
  network_id: string
  app_pk: string
  nonce: string
  wallet_uri: string
  app_uri: string
  token_app: string
  token_wallet: string
  token_management: string
  token_relay: string
  extra?: Record<string, unknown>
  raw?: Record<string, unknown>
}

export interface ConnectPermissions {
  methods?: ReadonlyArray<string>
  events?: ReadonlyArray<string>
  resources?: ReadonlyArray<string> | null
}

export interface ConnectApproval {
  readonly accountId: string
  readonly signingPublicKey: Uint8Array
  readonly walletPublicKey: Uint8Array
  readonly signature: Uint8Array
  readonly nativeIdentity?: NativeAccountIdentity
}

export interface ConnectAppSession {
  readonly socket: WebSocket
  readonly approvedAccountId: string | null
  waitForApproval: () => Promise<ConnectApproval>
  signTransaction: (unsignedTxBytes: ConnectBinaryLike) => Promise<Uint8Array>
  signRaw: (domainTag: string, bytes: ConnectBinaryLike) => Promise<Uint8Array>
  close: (reason?: string) => void
}

export interface ConnectAppSessionOptions {
  baseUrl: string
  preview: ConnectSessionPreview
  session: Pick<ConnectSessionResponse, 'sid' | 'token_app' | 'token_relay'>
  permissions?: ConnectPermissions | null
  appMeta?: {
    name: string
    url?: string | null
    iconHash?: string | null
    icon_hash?: string | null
  } | null
  webSocketImpl?: typeof WebSocket
  protocols?: string | ReadonlyArray<string>
  allowInsecure?: boolean
}

export interface ConnectCanonicalRequestAuth {
  readonly authAccountId: string
  readonly sign: (input: unknown) => Promise<Uint8Array>
  readonly nativeIdentity?: NativeAccountIdentity
}

export interface ConnectSessionPreviewOptions {
  networkId: ConnectNetworkId
  node?: string | null
  nonce?: ConnectBinaryLike | null
  appKeyPair?: {
    publicKey: ConnectBinaryLike
    privateKey: ConnectBinaryLike
  } | null
}

interface CandidateConnectSdk {
  NetworkId: {
    parse: (literal: string) => ConnectNetworkId
  }
  createConnectSessionPreview: (options: ConnectSessionPreviewOptions) => ConnectSessionPreview
  registerConnectSession: (
    baseUrl: string,
    preview: ConnectSessionPreview,
    options?: { node?: string | null, fetchImpl?: typeof fetch }
  ) => Promise<ConnectSessionResponse>
  createConnectAppSession: (options: ConnectAppSessionOptions & {
    inspectAccountIdentity: (accountId: string, options: { signal: AbortSignal }) => Promise<NativeAccountIdentity>
  }) => ConnectAppSession
  createConnectCanonicalRequestAuth: (
    session: Pick<ConnectAppSession, 'waitForApproval' | 'signRaw'>
  ) => Promise<ConnectCanonicalRequestAuth>
}

export type ConnectSdkNamespace = Record<string, unknown>;

function candidateConnectSdk(sdkNamespace: ConnectSdkNamespace = connectBrowserSdk): CandidateConnectSdk {
  const networkId = Reflect.get(sdkNamespace, 'NetworkId') as CandidateConnectSdk['NetworkId'] | undefined;
  const createPreview = Reflect.get(sdkNamespace, 'createConnectSessionPreview');
  const registerSession = Reflect.get(sdkNamespace, 'registerConnectSession');
  const createAppSession = Reflect.get(sdkNamespace, 'createConnectAppSession');
  const createCanonicalAuth = Reflect.get(sdkNamespace, 'createConnectCanonicalRequestAuth');
  if (
    typeof networkId?.parse !== 'function' ||
    typeof createPreview !== 'function' ||
    typeof registerSession !== 'function' ||
    typeof createAppSession !== 'function' ||
    typeof createCanonicalAuth !== 'function'
  ) {
    throw new Error('The installed Iroha SDK does not support exact-NetworkId Connect sessions.');
  }
  return {
    NetworkId: networkId,
    createConnectSessionPreview: createPreview as CandidateConnectSdk['createConnectSessionPreview'],
    registerConnectSession: registerSession as CandidateConnectSdk['registerConnectSession'],
    createConnectAppSession: createAppSession as CandidateConnectSdk['createConnectAppSession'],
    createConnectCanonicalRequestAuth: createCanonicalAuth as CandidateConnectSdk['createConnectCanonicalRequestAuth'],
  };
}

function configuredNetworkIdLiteral(): string | null {
  return getRuntimeConfig().networkId ?? null;
}

export function parseConnectNetworkId(
  literal: string,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectNetworkId {
  const exactLiteral = literal.trim();
  if (!exactLiteral) throw new Error('An exact Iroha NetworkId is required for Connect.');
  if (exactLiteral !== literal) throw new Error('Iroha NetworkId must not contain surrounding whitespace.');
  const parsed = candidateConnectSdk(sdkNamespace).NetworkId.parse(exactLiteral);
  if (parsed.toString() !== exactLiteral) {
    throw new Error('Iroha NetworkId is not in canonical emitted form.');
  }
  return parsed;
}

export type ConnectConfiguration =
  | { available: true, literal: string, networkId: ConnectNetworkId }
  | { available: false, error: Error };

export function getConnectConfiguration(
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectConfiguration {
  try {
    const literal = configuredNetworkIdLiteral();
    if (!literal) {
      return {
        available: false,
        error: new Error('Connect is disabled until an exact Iroha NetworkId is configured.'),
      };
    }
    return {
      available: true,
      literal,
      networkId: parseConnectNetworkId(literal, sdkNamespace),
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
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

export function createConnectSessionPreview(
  options: ConnectSessionPreviewOptions,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectSessionPreview {
  return candidateConnectSdk(sdkNamespace).createConnectSessionPreview(options);
}

export async function registerConnectSession(
  baseUrl: string,
  preview: ConnectSessionPreview,
  options: { node?: string | null, fetchImpl?: typeof fetch } = {},
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): Promise<ConnectSessionResponse> {
  return await candidateConnectSdk(sdkNamespace).registerConnectSession(baseUrl, preview, options);
}

export function createConnectAppSession(
  options: ConnectAppSessionOptions,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectAppSession {
  const identityClient = new ToriiBrowserClient(options.baseUrl, {
    networkId: connectBrowserSdk.NetworkId.parse(options.preview.networkId.toString()),
  });
  return candidateConnectSdk(sdkNamespace).createConnectAppSession({
    ...options,
    inspectAccountIdentity: (accountId, { signal }) => identityClient.inspectAccountIdentity(accountId, { signal }),
  });
}

export async function createConnectCanonicalRequestAuth(
  session: Pick<ConnectAppSession, 'waitForApproval' | 'signRaw'>,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): Promise<ConnectCanonicalRequestAuth> {
  return await candidateConnectSdk(sdkNamespace).createConnectCanonicalRequestAuth(session);
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
