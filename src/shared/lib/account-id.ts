import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';

export function getDisplayedAccountId(value: string): string {
  return normalizeAccountIdLiteral(value) ?? value;
}

export function getAccountRoutePath(value: string): string {
  return `/accounts/${encodeURIComponent(getDisplayedAccountId(value))}`;
}

export function normalizeAccountRoutePath(path: string): string {
  const match = /^\/accounts\/([^/?#]+)(.*)$/u.exec(path);
  if (!match) return path;

  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(match[1] ?? '');
  } catch {
    return path;
  }

  const normalizedSegment = getDisplayedAccountId(decodedSegment);
  return `/accounts/${encodeURIComponent(normalizedSegment)}${match[2] ?? ''}`;
}
