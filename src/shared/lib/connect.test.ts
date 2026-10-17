import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeConfigState = vi.hoisted(() => ({ value: {} as { networkId?: string } }));
const identityMocks = vi.hoisted(() => ({ create: vi.fn(), inspect: vi.fn() }));

vi.mock('@iroha/iroha-js/torii-browser', () => ({
  ToriiBrowserClient: class {
    constructor(...args: unknown[]) { identityMocks.create(...args); }
    inspectAccountIdentity(...args: unknown[]) { return identityMocks.inspect(...args); }
  },
}));

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => runtimeConfigState.value,
}));

import {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  createConnectSessionPreview,
  createConnectAppSession,
  getConnectConfiguration,
  parseConnectNetworkId,
  registerConnectSession,
  rewriteConnectUriProtocol,
  type ConnectNetworkId,
  type ConnectSdkNamespace,
  type ConnectSessionPreview,
  type ConnectSessionResponse,
} from './connect';

const NETWORK_ID_LITERAL = `hash:${'AB'.repeat(32)}#B99E`;

function candidateSdkFixture() {
  const networkId: ConnectNetworkId = {
    literal: NETWORK_ID_LITERAL,
    toBytes: () => new Uint8Array(32).fill(0xab),
    toString: () => NETWORK_ID_LITERAL,
  };
  const preview: ConnectSessionPreview = {
    networkId,
    node: 'https://taira.example',
    sidBytes: new Uint8Array(32).fill(1),
    sidBase64Url: 'preview-sid',
    nonce: new Uint8Array(16).fill(2),
    appKeyPair: {
      publicKey: new Uint8Array(32).fill(3),
      privateKey: new Uint8Array(32).fill(4),
    },
    walletUri: 'iroha://connect?role=wallet',
    appUri: 'iroha://connect?role=app',
    wsUrl: 'wss://taira.example/v1/connect/ws?sid=preview-sid&role=app',
    createdAt: 1,
  };
  const session: ConnectSessionResponse = {
    sid: preview.sidBase64Url,
    network_id: NETWORK_ID_LITERAL,
    app_pk: 'app-public-key',
    nonce: 'nonce',
    wallet_uri: 'iroha://connect?role=wallet&token=wallet',
    app_uri: 'iroha://connect?role=app&token=app',
    token_app: 'app-token',
    token_wallet: 'wallet-token',
    token_management: 'management-token',
    token_relay: 'relay-token',
  };
  const parse = vi.fn((literal: string) => {
    if (literal !== NETWORK_ID_LITERAL) throw new Error('invalid NetworkId fixture');
    return networkId;
  });
  const createPreview = vi.fn((_options: unknown) => preview);
  const registerSession = vi.fn(async (
    _baseUrl: string,
    _preview: ConnectSessionPreview,
    _options: unknown
  ) => session);
  const sdk = {
    NetworkId: { parse },
    createConnectSessionPreview: createPreview,
    registerConnectSession: registerSession,
    createConnectAppSession: vi.fn(),
    createConnectCanonicalRequestAuth: vi.fn(),
  } as unknown as ConnectSdkNamespace;
  return { createPreview, networkId, parse, preview, registerSession, sdk, session };
}

describe('connect helpers', () => {
  beforeEach(() => {
    runtimeConfigState.value = {};
    identityMocks.create.mockClear();
    identityMocks.inspect.mockReset();
  });

  it('uses the installed SDK for canonical NetworkId preview identity', () => {
    const networkId = parseConnectNetworkId(NETWORK_ID_LITERAL);
    expect(networkId.toString()).toBe(NETWORK_ID_LITERAL);
    expect(Array.from(networkId.toBytes())).toEqual(Array(32).fill(0xab));
    expect(() => parseConnectNetworkId('ab'.repeat(32))).toThrow();
    const preview = createConnectSessionPreview({ networkId, node: 'https://taira.sora.org' });
    expect(preview.networkId.toString()).toBe(NETWORK_ID_LITERAL);
    expect(preview.sidBytes).toHaveLength(32);
  });

  it('parses the exact configured literal through the candidate NetworkId API', () => {
    const fixture = candidateSdkFixture();

    expect(parseConnectNetworkId(NETWORK_ID_LITERAL, fixture.sdk)).toBe(fixture.networkId);
    expect(fixture.parse).toHaveBeenCalledWith(NETWORK_ID_LITERAL);
    expect(() => parseConnectNetworkId(` ${NETWORK_ID_LITERAL}`, fixture.sdk)).toThrow(/surrounding whitespace/u);
  });

  it('fails closed when runtime config is missing or invalid', () => {
    const fixture = candidateSdkFixture();
    expect(getConnectConfiguration(fixture.sdk)).toMatchObject({ available: false });

    runtimeConfigState.value = { networkId: '00'.repeat(32) };
    const invalid = getConnectConfiguration(fixture.sdk);
    expect(invalid.available).toBe(false);
    if (!invalid.available) expect(invalid.error.message).toMatch(/invalid NetworkId fixture/u);
  });

  it('delegates preview construction with NetworkId and no legacy chainId field', () => {
    const fixture = candidateSdkFixture();
    const result = createConnectSessionPreview({
      networkId: fixture.networkId,
      node: 'https://taira.example',
      nonce: new Uint8Array(16).fill(2),
      appKeyPair: {
        publicKey: new Uint8Array(32).fill(3),
        privateKey: new Uint8Array(32).fill(4),
      },
    }, fixture.sdk);

    expect(result).toBe(fixture.preview);
    expect(fixture.createPreview).toHaveBeenCalledOnce();
    expect(fixture.createPreview.mock.calls[0]?.[0]).not.toHaveProperty('chainId');
    expect(fixture.createPreview.mock.calls[0]?.[0]).toMatchObject({ networkId: fixture.networkId });
  });

  it('registers the complete preview instead of posting a caller-provided SID', async () => {
    const fixture = candidateSdkFixture();
    const result = await registerConnectSession(
      'https://taira.example',
      fixture.preview,
      { node: 'taira.example' },
      fixture.sdk
    );

    expect(result).toBe(fixture.session);
    expect(fixture.registerSession).toHaveBeenCalledWith(
      'https://taira.example',
      fixture.preview,
      { node: 'taira.example' }
    );
  });

  it('binds wallet approval inspection to an unsigned SDK client at the exact session origin and network', async () => {
    const fixture = candidateSdkFixture();
    const nativeIdentity = Object.freeze({ accountId: 'approved-account' });
    identityMocks.inspect.mockResolvedValue(nativeIdentity);
    createConnectAppSession({ baseUrl: 'https://taira.example', preview: fixture.preview, session: fixture.session }, fixture.sdk);
    expect(identityMocks.create).toHaveBeenCalledWith('https://taira.example', { networkId: expect.anything() });
    expect(identityMocks.create.mock.calls[0][1].networkId.toString()).toBe(NETWORK_ID_LITERAL);
    const create = fixture.sdk.createConnectAppSession as ReturnType<typeof vi.fn>;
    const options = create.mock.calls[0][0];
    const controller = new AbortController();
    await expect(options.inspectAccountIdentity('approved-account', { signal: controller.signal })).resolves.toBe(nativeIdentity);
    expect(identityMocks.inspect).toHaveBeenCalledWith('approved-account', { signal: controller.signal });
    expect(options).toMatchObject({ baseUrl: 'https://taira.example', preview: fixture.preview, session: fixture.session });
  });

  it('propagates native identity inspection rejection without synthesizing an identity', async () => {
    const fixture = candidateSdkFixture();
    identityMocks.inspect.mockRejectedValue(new Error('Account identity is invalid'));
    createConnectAppSession({ baseUrl: 'https://taira.example', preview: fixture.preview, session: fixture.session }, fixture.sdk);
    const create = fixture.sdk.createConnectAppSession as ReturnType<typeof vi.fn>;
    const options = create.mock.calls[0][0];
    await expect(options.inspectAccountIdentity('bad-account', { signal: new AbortController().signal })).rejects.toThrow('identity is invalid');
  });

  it('builds browser websocket URLs and token subprotocols that match upstream Connect expectations', () => {
    expect(buildConnectWebSocketUrl('https://taira.sora.org', 'session-id', 'wallet')).toBe(
      'wss://taira.sora.org/v1/connect/ws?sid=session-id&role=wallet'
    );
    expect(buildConnectTokenProtocol('abc_123')).toBe('iroha-connect.token.v1.YWJjXzEyMw');
    expect(rewriteConnectUriProtocol('iroha://connect?sid=session-id&role=wallet')).toBe(
      'irohaconnect://connect?sid=session-id&role=wallet'
    );
  });
});
