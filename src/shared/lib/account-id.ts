import { normalizeAccountIdLiteral } from '@/shared/lib/account-literal';

export interface AccountDisplaySource {
  id: string | { toString: () => string }
  i105_address?: string | null
}

type AccountLiteralLike = string | { toString: () => string };

function stringifyAccountLiteral(value: AccountLiteralLike): string {
  return value.toString().trim();
}

export function getDisplayedAccountId(value: AccountLiteralLike, _toriiBaseUrl?: string | null): string {
  const literal = stringifyAccountLiteral(value);
  const accountId = normalizeAccountIdLiteral(literal);
  if (!accountId) return literal;
  return accountId;
}

export function getAccountRoutePath(value: AccountLiteralLike, toriiBaseUrl?: string | null): string {
  return `/accounts/${encodeURIComponent(getDisplayedAccountId(value, toriiBaseUrl))}`;
}

export function normalizeAccountRoutePath(path: string, toriiBaseUrl?: string | null): string {
  const match = /^\/accounts\/([^/?#]+)(.*)$/u.exec(path);
  if (!match) return path;

  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(match[1] ?? '');
  } catch {
    return path;
  }

  const normalizedSegment = getDisplayedAccountId(decodedSegment, toriiBaseUrl);
  return `/accounts/${encodeURIComponent(normalizedSegment)}${match[2] ?? ''}`;
}

export function getPreferredAccountId(value: AccountDisplaySource, toriiBaseUrl?: string | null): string {
  const preferred = value.i105_address?.trim();
  if (preferred) return getDisplayedAccountId(preferred, toriiBaseUrl);

  return getDisplayedAccountId(value.id, toriiBaseUrl);
}
