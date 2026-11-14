import { describe, expect, it } from 'vitest';
import { parseBlockWindow, serializeBlockWindow, type StoredBlockWindow } from './block-window-cache';

import { requireIrohaHashLiteral32 } from './iroha-hash';

const HASH = requireIrohaHashLiteral32('ab'.repeat(32));
const T0 = Date.UTC(2026, 9, 25, 5, 0, 0);

const stored: StoredBlockWindow = {
  readAt: T0,
  acquiredAt: T0,
  reachedGenesis: false,
  samples: [
    { height: 41, hash: HASH, createdAtMs: T0 - 2000, transactionsTotal: 3, transactionsRejected: 1 },
    { height: 42, hash: HASH, createdAtMs: null, transactionsTotal: 0, transactionsRejected: 0 },
    { height: 43, hash: HASH, createdAtMs: T0, transactionsTotal: 1, transactionsRejected: 0 },
  ],
};

function withRows(rows: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 2, read_at: T0, acquired_at: T0, genesis: false, rows, ...extra });
}

describe('block window cache', () => {
  it('round-trips a window, keeping unreadable bodies unknown', () => {
    expect(parseBlockWindow(serializeBlockWindow(stored))).toEqual(stored);
  });

  it('rejects rows that are not one contiguous run of block summaries', () => {
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 0], [43, HASH, T0, 1, 0]]))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 2]]))).toBeNull();
    expect(parseBlockWindow(withRows([[0, HASH, T0, 1, 0]]))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, 'soon', 1, 0]]))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1]]))).toBeNull();
    expect(parseBlockWindow(withRows([]))).toBeNull();
  });

  it('rejects missing or malformed hash anchors and invalid acquisition times', () => {
    expect(parseBlockWindow(withRows([[41, 'hash:00', T0, 1, 0]]))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH.toLowerCase(), T0, 1, 0]]))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 0]], { acquired_at: T0 + 1 }))).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 0]], { acquired_at: null }))).toBeNull();
  });

  it('rejects other versions, malformed text and a genesis claim that does not start at height 1', () => {
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 0]], { version: 1 }))).toBeNull();
    expect(parseBlockWindow('{')).toBeNull();
    expect(parseBlockWindow(null)).toBeNull();
    expect(parseBlockWindow(withRows([[41, HASH, T0, 1, 0]], { genesis: true }))).toBeNull();
    expect(parseBlockWindow(withRows([[1, HASH, T0, 1, 0], [2, HASH, T0, 0, 0]], { genesis: true }))?.reachedGenesis).toBe(true);
  });
});
