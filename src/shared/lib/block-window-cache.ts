import type { CanonicalBlockSample } from './chain-analytics';
import { isCanonicalIrohaHashLiteral32 } from './iroha-hash';

const VERSION = 2;

/** A dashboard block window as kept between visits: contiguous rows ending at one head read. */
export interface StoredBlockWindow {
  samples: CanonicalBlockSample[]
  reachedGenesis: boolean
  /** Local time of the head read the rows end at. */
  readAt: number
  /** Acquisition time of the oldest retained source read; head refreshes do not renew it. */
  acquiredAt: number
}

/** Rows are `[height, hash, createdAtMs | null, transactionsTotal, transactionsRejected]`, oldest first. */
export function serializeBlockWindow(window: StoredBlockWindow): string {
  return JSON.stringify({
    version: VERSION,
    read_at: window.readAt,
    acquired_at: window.acquiredAt,
    genesis: window.reachedGenesis,
    rows: window.samples.map((sample) => [
      sample.height,
      sample.hash,
      sample.createdAtMs,
      sample.transactionsTotal,
      sample.transactionsRejected,
    ]),
  });
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function sampleFrom(row: unknown, previous: CanonicalBlockSample | undefined): CanonicalBlockSample | null {
  if (!Array.isArray(row) || row.length !== 5) return null;
  const [height, hash, createdAtMs, total, rejected] = row as unknown[];
  if (!isCount(height) || height < 1 || (previous && height !== previous.height + 1)) return null;
  if (!isCanonicalIrohaHashLiteral32(hash)) return null;
  if (!(createdAtMs === null || isCount(createdAtMs))) return null;
  if (!isCount(total) || !isCount(rejected) || rejected > total) return null;
  return { height, hash, createdAtMs, transactionsTotal: total, transactionsRejected: rejected };
}

/** The stored window, or `null` unless every row is a well-formed block summary in one contiguous run. */
export function parseBlockWindow(raw: string | null): StoredBlockWindow | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { version, read_at: readAt, acquired_at: acquiredAt, genesis, rows } = parsed as Record<string, unknown>;
  if (version !== VERSION || !isCount(readAt) || !isCount(acquiredAt) || acquiredAt > readAt || typeof genesis !== 'boolean' || !Array.isArray(rows)) return null;
  const samples: CanonicalBlockSample[] = [];
  for (const row of rows) {
    const sample = sampleFrom(row, samples[samples.length - 1]);
    if (!sample) return null;
    samples.push(sample);
  }
  if (samples.length === 0 || (genesis && samples[0]!.height !== 1)) return null;
  return { samples, reachedGenesis: genesis, readAt, acquiredAt };
}
