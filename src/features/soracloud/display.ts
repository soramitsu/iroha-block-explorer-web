import { formatNumber } from '@/shared/ui/utils/formatters';

export function formatNullableNumber(value: number | null | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—';
}

export function jsonString(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
