import { z } from 'zod';

export const NetworkPrefixSchema = z.number().int().min(0).max(65535);

export function requireNetworkPrefix(value: unknown): number {
  const parsed = NetworkPrefixSchema.safeParse(value);
  if (!parsed.success) throw new Error('Explorer network prefix is unavailable or invalid.');
  return parsed.data;
}
