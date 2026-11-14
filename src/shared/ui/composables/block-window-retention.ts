import { getToriiBaseUrl } from '@/shared/api';
import { parseBlockWindow, serializeBlockWindow } from '@/shared/lib/block-window-cache';
import type { CanonicalBlockSample } from '@/shared/lib/chain-analytics';
import { createPublicHistoryCacheKey } from '@/shared/lib/history-cache';
import type { HistoryScanCursor } from '@/shared/lib/history-scan';
import { getRuntimeConfig } from '@/shared/runtime-config';

/** A block window kept for the next dashboard or visit. */
export interface RetainedBlockWindow {
  samples: CanonicalBlockSample[]
  reachedGenesis: boolean
  /** Local time of the head read the samples end at. */
  readAt: number
  /** Original acquisition time, unchanged by head-only refreshes. */
  acquiredAt: number
  /** Continuation below the oldest sample; valid only within this page session. */
  cursor: HistoryScanCursor | null
}

export interface BlockWindowRetention {
  load: () => RetainedBlockWindow | null
  save: (window: RetainedBlockWindow) => void
}

/** The block window the Network and Activity dashboards share. */
export const DASHBOARD_BLOCK_WINDOW = 'dashboard-blocks';

/** A kept window older than this is read afresh rather than reconnected. */
export const RETAINED_WINDOW_MAX_AGE_MS = 30 * 60_000;

const sessionWindows = new Map<string, RetainedBlockWindow>();

function storedWindow(key: string): RetainedBlockWindow | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = parseBlockWindow(window.localStorage.getItem(key));
    return stored ? { ...stored, cursor: null } : null;
  } catch {
    return null;
  }
}

/**
 * Keep a dashboard's block window for the next dashboard and the next visit:
 * in memory with its continuation for this page session, and in
 * localStorage as rows only across reloads. Like the other history caches,
 * only an anonymous reader's window is kept, under the exact network and
 * Torii endpoint, and never once the reader identity changes.
 */
export function blockWindowRetention(kind: string, now: () => number = Date.now): BlockWindowRetention {
  const key = createPublicHistoryCacheKey(kind, getRuntimeConfig().networkId, getToriiBaseUrl());
  return {
    load() {
      const current = key();
      if (!current) return null;
      const kept = sessionWindows.get(current) ?? storedWindow(current);
      const currentTime = now();
      const age = kept ? currentTime - kept.acquiredAt : -1;
      return kept && kept.readAt <= currentTime && age >= 0 && age <= RETAINED_WINDOW_MAX_AGE_MS ? kept : null;
    },
    save(kept) {
      const current = key();
      if (!current || kept.samples.length === 0) return;
      sessionWindows.set(current, kept);
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(current, serializeBlockWindow(kept));
      } catch {
        // Storage may be full or disabled; the in-memory copy still serves this session.
      }
    },
  };
}
