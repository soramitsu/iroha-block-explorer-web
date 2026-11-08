// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { startHistoryRecoveryServer } from './history-recovery-server';
import tairaHistory from '../fixtures/taira-history.json' with { type: 'json' };

const peers: Awaited<ReturnType<typeof startHistoryRecoveryServer>>[] = [];

afterEach(async () => {
  await Promise.all(peers.splice(0).map(peer => peer.close()));
});

describe('history recovery HTTP fixtures', () => {
  it('fails initial history then returns the current wire collection unchanged', async () => {
    const peer = await startHistoryRecoveryServer('http://127.0.0.1:4175');
    peers.push(peer);
    const endpoint = `${peer.origin}/v1/explorer/transactions/latest/query`;

    expect((await fetch(endpoint, { method: 'POST', body: JSON.stringify({ limit: 5 }), headers: { 'Content-Type': 'application/json' } })).status).toBe(500);
    const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ limit: 5 }), headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload).sort()).toEqual(['items', 'next_cursor']);
    expect(payload).toEqual(tairaHistory.latestTransactions);
    expect(peer.latestRequests).toBe(2);
    expect(peer.unexpectedRequests).toEqual([]);
  });

  it('returns current block collections without invented pagination metadata', async () => {
    const peer = await startHistoryRecoveryServer('http://127.0.0.1:4175');
    peers.push(peer);
    const response = await fetch(`${peer.origin}/v1/explorer/blocks/query`, { method: 'POST', body: JSON.stringify({ limit: 10 }), headers: { 'Content-Type': 'application/json' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4175');
    const payload = await response.json();
    expect(Object.keys(payload).sort()).toEqual(['items', 'next_cursor']);
    expect(payload).toEqual(tairaHistory.blocks);
    expect(peer.unexpectedRequests).toEqual([]);
  });

  it('does not treat arbitrary POST requests as collection reads', async () => {
    const peer = await startHistoryRecoveryServer('http://127.0.0.1:4175');
    peers.push(peer);
    const response = await fetch(`${peer.origin}/v1/transactions`, { method: 'POST', body: '{}' });

    expect(response.status).toBe(405);
    expect(peer.latestRequests).toBe(0);
    expect(peer.unexpectedRequests).toEqual(['Write blocked: POST /v1/transactions']);
  });

});
