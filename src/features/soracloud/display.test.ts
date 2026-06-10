import { describe, expect, it } from 'vitest';
import { formatNumber } from '@/shared/ui/utils/formatters';
import { formatNullableNumber, jsonString } from './display';

describe('soracloud display helpers', () => {
  it('formats numbers and falls back to an em dash when the value is absent', () => {
    expect(formatNullableNumber(1234567)).toBe(formatNumber(1234567));
    expect(formatNullableNumber(null)).toBe('—');
    expect(formatNullableNumber(undefined)).toBe('—');
  });

  it('renders strings and JSON payloads into inline-friendly text', () => {
    expect(jsonString('ready')).toBe('ready');
    expect(jsonString({ status: 'healthy', revisions: 2 })).toBe('{"status":"healthy","revisions":2}');
    expect(jsonString(null)).toBe('—');
    expect(jsonString(undefined)).toBe('—');
  });

  it('falls back to String(value) when JSON serialization throws', () => {
    const nonJsonValue = {
      value: 1n,
      toString() {
        return 'custom-fallback';
      },
    };

    expect(jsonString(nonJsonValue)).toBe('custom-fallback');
  });
});
