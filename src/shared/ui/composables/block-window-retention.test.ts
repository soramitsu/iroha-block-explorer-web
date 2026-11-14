import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalBlockSample } from '@/shared/lib/chain-analytics';

import { requireIrohaHashLiteral32 } from '@/shared/lib/iroha-hash';

const reader = vi.hoisted(() => ({ isPublic: true, revision: 0 }));

vi.mock('@/shared/api', () => ({ getToriiBaseUrl: () => 'https://torii.example' }));
vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => ({ networkId: 'hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774' }),
}));
vi.mock('@/shared/lib/explorer-read-auth', () => ({
  explorerReadIsPublic: {
    get value() {
      return reader.isPublic;
    },
  },
  explorerReadAuthRevision: {
    get value() {
      return reader.revision;
    },
  },
}));

const { blockWindowRetention, RETAINED_WINDOW_MAX_AGE_MS } = await import('./block-window-retention');

const T0 = Date.UTC(2026, 9, 25, 5, 0, 0);

function samples(from: number, to: number): CanonicalBlockSample[] {
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    height: from + index,
    hash: requireIrohaHashLiteral32(((from + index) * 2 + 1).toString(16).padStart(64, '0')),
    createdAtMs: T0 - (to - from - index) * 1000,
    transactionsTotal: 1,
    transactionsRejected: 0,
  }));
}

let kind = 0;
function nextKind() {
  kind += 1;
  return `dashboard-blocks-test-${kind}`;
}

beforeEach(() => {
  reader.isPublic = true;
  reader.revision = 0;
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('blockWindowRetention', () => {
  it('hands the same session its window with the continuation, and a reload the rows alone', () => {
    const cursor = { nextCursor: 'c40', visitedCursors: ['c40'] };
    const name = nextKind();
    blockWindowRetention(name, () => T0).save({ samples: samples(41, 43), reachedGenesis: false, readAt: T0, acquiredAt: T0, cursor });
    expect(blockWindowRetention(name, () => T0).load()?.cursor).toBe(cursor);

    // A reload keeps localStorage but not memory: rows come back without a continuation.
    const stored = Object.entries(window.localStorage).find(([key]) => key.includes(name));
    expect(stored).toBeDefined();
    const other = nextKind();
    window.localStorage.setItem(stored![0].replace(name, other), stored![1]);
    expect(blockWindowRetention(other, () => T0).load()).toEqual({
      samples: samples(41, 43),
      reachedGenesis: false,
      readAt: T0, acquiredAt: T0,
      cursor: null,
    });
  });

  it('serves nothing once the window is too old to reconnect', () => {
    const name = nextKind();
    blockWindowRetention(name, () => T0).save({ samples: samples(1, 2), reachedGenesis: true, readAt: T0, acquiredAt: T0, cursor: null });
    expect(blockWindowRetention(name, () => T0 + RETAINED_WINDOW_MAX_AGE_MS).load()).not.toBeNull();
    expect(blockWindowRetention(name, () => T0 + RETAINED_WINDOW_MAX_AGE_MS + 1).load()).toBeNull();
  });

  it('expires by acquisition age even after repeated successful head reads', () => {
    const name = nextKind();
    const original = { samples: samples(1, 2), reachedGenesis: true, readAt: T0, acquiredAt: T0, cursor: null };
    blockWindowRetention(name, () => T0).save(original);
    blockWindowRetention(name, () => T0 + 20 * 60_000).save({ ...original, readAt: T0 + 20 * 60_000 });
    expect(blockWindowRetention(name, () => T0 + RETAINED_WINDOW_MAX_AGE_MS + 1).load()).toBeNull();

    const stored = Object.entries(window.localStorage).find(([key]) => key.includes(name))!;
    const reloaded = nextKind();
    window.localStorage.setItem(stored[0].replace(name, reloaded), stored[1]);
    expect(blockWindowRetention(reloaded, () => T0 + RETAINED_WINDOW_MAX_AGE_MS + 1).load()).toBeNull();
  });

  it('does not accept windows acquired in the future after a clock rollback', () => {
    const name = nextKind();
    blockWindowRetention(name, () => T0).save({ samples: samples(1, 2), reachedGenesis: true, readAt: T0, acquiredAt: T0, cursor: null });
    expect(blockWindowRetention(name, () => T0 - 1).load()).toBeNull();
  });

  it('rejects a future head-read time even when acquisition is in the past', () => {
    const name = nextKind();
    blockWindowRetention(name, () => T0).save({ samples: samples(1, 2), reachedGenesis: true, readAt: T0 + 60_000, acquiredAt: T0, cursor: null });
    expect(blockWindowRetention(name, () => T0 + 30_000).load()).toBeNull();

    const stored = Object.entries(window.localStorage).find(([key]) => key.includes(name))!;
    const reloaded = nextKind();
    window.localStorage.setItem(stored[0].replace(name, reloaded), stored[1]);
    expect(blockWindowRetention(reloaded, () => T0 + 30_000).load()).toBeNull();
  });

  it('keeps nothing for a signed-in reader or after the reader identity changes', () => {
    const name = nextKind();
    reader.isPublic = false;
    blockWindowRetention(name, () => T0).save({ samples: samples(1, 2), reachedGenesis: true, readAt: T0, acquiredAt: T0, cursor: null });
    expect(window.localStorage.length).toBe(0);

    reader.isPublic = true;
    const retention = blockWindowRetention(name, () => T0);
    reader.revision = 1;
    retention.save({ samples: samples(1, 2), reachedGenesis: true, readAt: T0, acquiredAt: T0, cursor: null });
    expect(window.localStorage.length).toBe(0);
    expect(retention.load()).toBeNull();
  });
});
