// Explorer read paths preserve account identifiers for Torii to admit. The SDK's
// canonical address codec requires native Rust and is unavailable in browsers.
const NORITO_LITERAL_RE = /^norito:[0-9a-f]+$/i;
const ACCOUNT_ALIAS_FORBIDDEN_SEGMENT_CHARS_RE = /[@#$:\s]/u;
const I105_SELECTOR_RE = /^(?:sora|test|dev|n(?:0|[1-9][0-9]{0,4}))[1-9A-HJ-NP-Za-km-zｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦﾜｶﾖﾀﾚｿﾂﾈﾅﾗﾑｳヰﾉｵｸﾔﾏｹﾌｺｴﾃｱｻｷﾕﾒﾐｼヱﾋﾓｾｽ]{7,}$/u;

export interface AccountAliasLiteral {
  literal: string;
  label: string;
  domain: string | null;
  dataspace: string;
}

function normalizeAliasSegment(segment: string): string | null {
  const trimmed = segment.trim();
  if (!trimmed || trimmed !== segment) return null;
  if (ACCOUNT_ALIAS_FORBIDDEN_SEGMENT_CHARS_RE.test(trimmed)) return null;
  if ([...trimmed].some((char) => char === '.' || char === ':')) return null;
  if (containsControlCharacters(trimmed)) return null;
  return trimmed.toLowerCase();
}

function containsControlCharacters(value: string): boolean {
  return /\p{Cc}/u.test(value);
}

/** Screen exact I105 selector text for read requests and display only.
 * Torii owns checksum, controller, key and network admission. This function
 * does not decode an account, construct identity bytes or authorize signing. */
export function normalizeAccountIdLiteral(value: string): string | null {
  return value.trim() === value && I105_SELECTOR_RE.test(value) ? value : null;
}

export function parseAccountAliasLiteral(value: string): AccountAliasLiteral | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed !== value) return null;
  if (containsControlCharacters(trimmed)) return null;

  const [labelPart, right] = trimmed.split('@');
  if (!labelPart || !right) return null;
  if (trimmed.indexOf('@') !== trimmed.lastIndexOf('@')) return null;

  const label = normalizeAliasSegment(labelPart);
  if (!label) return null;

  const dotCount = [...right].filter((char) => char === '.').length;
  if (dotCount > 1) return null;

  if (dotCount === 1) {
    const [domainPart, dataspacePart] = right.split('.');
    const domain = normalizeAliasSegment(domainPart ?? '');
    const dataspace = normalizeAliasSegment(dataspacePart ?? '');
    if (!domain || !dataspace) return null;
    return {
      literal: `${label}@${domain}.${dataspace}`,
      label,
      domain,
      dataspace,
    };
  }

  const dataspace = normalizeAliasSegment(right);
  if (!dataspace) return null;
  return {
    literal: `${label}@${dataspace}`,
    label,
    domain: null,
    dataspace,
  };
}

export function normalizeAccountAliasLiteral(value: string): string | null {
  return parseAccountAliasLiteral(value)?.literal ?? null;
}

export function normalizeAccountSelectorLiteral(value: string): string | null {
  return normalizeAccountIdLiteral(value) ?? normalizeAccountAliasLiteral(value);
}

export function normalizeDisplayedAccountSelectorLiteral(value: string, _toriiBaseUrl?: string | null): string | null {
  const accountId = normalizeAccountIdLiteral(value);
  if (accountId) return accountId;

  return normalizeAccountAliasLiteral(value);
}

export function normalizeToriiAccountSelectorLiteral(value: string, _toriiBaseUrl?: string | null): string | null {
  const accountId = normalizeAccountIdLiteral(value);
  if (accountId) return accountId;

  return normalizeAccountAliasLiteral(value);
}

export function isEncodedAccountLiteral(value: string): boolean {
  return normalizeAccountIdLiteral(value) !== null;
}

export function isAccountSelectorLiteral(value: string): boolean {
  return normalizeAccountSelectorLiteral(value) !== null;
}

export function normalizeEncodedAccountLiteral(value: string): string | null {
  return normalizeAccountIdLiteral(value.trim());
}

export function normalizeLooseAccountLiteral(value: string): string | null {
  return normalizeAccountSelectorLiteral(value);
}

export function isEncodedAssetLiteral(value: string): boolean {
  return NORITO_LITERAL_RE.test(value.trim());
}
