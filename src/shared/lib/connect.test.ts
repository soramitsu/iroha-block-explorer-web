import { describe, expect, it } from 'vitest';
import { NetworkId } from '@iroha/iroha-js/browser';
import {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  createConnectSessionPreview,
  rewriteConnectUriProtocol,
} from './connect';

const networkId = NetworkId.parse(
  'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0'
);
const appKeyPair = {
  publicKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)),
  privateKey: Uint8Array.from(Array.from({ length: 32 }, (_, index) => 0x40 + index)),
};

describe('connect helpers', () => {
  it('builds a deterministic preview bound to the exact NetworkId, app key, and nonce', () => {
    const preview = createConnectSessionPreview({
      networkId,
      node: 'https://taira.sora.org',
      appKeyPair,
      nonce: Uint8Array.from(Array.from({ length: 16 }, (_, index) => 0xa0 + index)),
    });

    expect(Buffer.from(preview.sidBytes).toString('hex')).toBe(
      '09c3d1d1fcdf57d5c37e82b83273c9b3c99659b9d82e62ec700f6ea5a901acff'
    );
    expect(preview.sidBase64Url).toBe('CcPR0fzfV9XDfoK4MnPJs8mWWbnYLmLscA9upakBrP8');
    expect(preview.walletUri).toBe(
      'iroha://connect?sid=CcPR0fzfV9XDfoK4MnPJs8mWWbnYLmLscA9upakBrP8&network_id=hash%3A32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149%23A2F0&app_pk=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA&nonce=oKGio6SlpqeoqaqrrK2urw&v=1&role=wallet&node=https%3A%2F%2Ftaira.sora.org'
    );
    expect(preview.appUri).toBe(
      'iroha://connect?sid=CcPR0fzfV9XDfoK4MnPJs8mWWbnYLmLscA9upakBrP8&network_id=hash%3A32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149%23A2F0&app_pk=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA&nonce=oKGio6SlpqeoqaqrrK2urw&v=1&role=app&node=https%3A%2F%2Ftaira.sora.org'
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
        networkId,
        appKeyPair: { ...appKeyPair, publicKey: new Uint8Array(31) },
      })
    ).toThrow('appKeyPair.publicKey must be 32 bytes');

    expect(() =>
      createConnectSessionPreview({
        networkId,
        appKeyPair,
        nonce: new Uint8Array(15),
      })
    ).toThrow('nonce must be 16 bytes');
  });
});
