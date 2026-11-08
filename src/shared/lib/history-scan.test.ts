import { describe, expect, it } from 'vitest';
import { advanceHistoryScanCursor, createHistoryScanCursor, HistoryScanCursorSchema } from './history-scan';

describe('history scan cursor', () => {
  it('follows opaque continuations through empty pages to explicit exhaustion', () => {
    const first = advanceHistoryScanCursor(createHistoryScanCursor(), { nextCursor: 'opaque-a' });
    const second = advanceHistoryScanCursor(first, { nextCursor: 'opaque-b' });
    expect(second).toEqual({ nextCursor: 'opaque-b', visitedCursors: ['opaque-a', 'opaque-b'] });
    expect(advanceHistoryScanCursor(second, { nextCursor: null }).nextCursor).toBeNull();
  });

  it('rejects immediate repetition and multi-page cycles', () => {
    const first = advanceHistoryScanCursor(createHistoryScanCursor(), { nextCursor: 'a' });
    expect(() => advanceHistoryScanCursor(first, { nextCursor: 'a' })).toThrow('did not advance');
    const second = advanceHistoryScanCursor(first, { nextCursor: 'b' });
    expect(() => advanceHistoryScanCursor(second, { nextCursor: 'a' })).toThrow('did not advance');
  });

  it('requires a nonempty opaque cursor or explicit null and rejects retired snapshot state', () => {
    expect(() => advanceHistoryScanCursor(createHistoryScanCursor(), { nextCursor: '' })).toThrow();
    expect(HistoryScanCursorSchema.safeParse({ ...createHistoryScanCursor(), snapshot: null }).success).toBe(false);
  });
});
