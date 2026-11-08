import { z } from 'zod/v4';
import { CollectionContinuation } from '@/shared/api/schemas';

const OpaqueCursor = z.string().min(1);

export const HistoryScanCursorSchema = z.object({
  nextCursor: OpaqueCursor.nullable(),
  visitedCursors: OpaqueCursor.array(),
}).strict();

export type HistoryScanCursor = z.infer<typeof HistoryScanCursorSchema>;

export function createHistoryScanCursor(): HistoryScanCursor {
  return { nextCursor: null, visitedCursors: [] };
}

/** Follow every opaque continuation, including empty pages, while rejecting cycles. */
export function advanceHistoryScanCursor(
  current: HistoryScanCursor,
  value: CollectionContinuation
): HistoryScanCursor {
  const { nextCursor } = CollectionContinuation.parse(value);
  if (nextCursor !== null && (nextCursor === current.nextCursor || current.visitedCursors.includes(nextCursor))) {
    throw new Error('Explorer history cursor did not advance');
  }
  return {
    nextCursor,
    visitedCursors: nextCursor === null ? current.visitedCursors : [...current.visitedCursors, nextCursor],
  };
}
