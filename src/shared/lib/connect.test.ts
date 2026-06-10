import { describe, expect, it } from 'vitest';
import {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  createConnectSessionPreview,
  rewriteConnectUriProtocol,
} from './connect';

describe('connect helpers', () => {
  it('builds a deterministic preview payload from chain id, app public key, and nonce', () => {
    const preview = createConnectSessionPreview({
      chainId: 'taira',
      node: 'taira.sora.org',
      appPublicKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)),
      nonce: Uint8Array.from(Array.from({ length: 16 }, (_, index) => 0xa0 + index)),
    });

    expect(Buffer.from(preview.sidBytes).toString('hex')).toBe(
      'eaa4aed4d2386cb2f2fe8d46c505873cd379226ee6f482046f00084b84b0a81c'
    );
    expect(preview.sidBase64Url).toBe('6qSu1NI4bLLy_o1GxQWHPNN5Im7m9IIEbwAIS4SwqBw');
    expect(preview.walletUri).toBe(
      'iroha://connect?sid=6qSu1NI4bLLy_o1GxQWHPNN5Im7m9IIEbwAIS4SwqBw&chain_id=taira&v=1&role=wallet&node=taira.sora.org'
    );
    expect(preview.appUri).toBe(
      'iroha://connect?sid=6qSu1NI4bLLy_o1GxQWHPNN5Im7m9IIEbwAIS4SwqBw&chain_id=taira&v=1&role=app&node=taira.sora.org'
    );
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

  it('rejects malformed preview key material', () => {
    expect(() =>
      createConnectSessionPreview({
        chainId: 'taira',
        appPublicKey: new Uint8Array(31),
      })
    ).toThrow('appPublicKey must be 32 bytes');

    expect(() =>
      createConnectSessionPreview({
        chainId: 'taira',
        nonce: new Uint8Array(15),
      })
    ).toThrow('nonce must be 16 bytes');
  });
});
