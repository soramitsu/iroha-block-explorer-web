export interface RwaIdDisplay {
  literal: string
  hash: string
  domain: string | null
}

const RWA_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

function coerceLiteral(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const toString = (value as { toString?: unknown }).toString;
  if (typeof toString !== 'function') return '';

  const literal = toString.call(value);
  return typeof literal === 'string' ? literal.trim() : '';
}

export function describeRwaId(value: unknown): RwaIdDisplay {
  const literal = coerceLiteral(value);
  if (!literal) return { literal: '', hash: '', domain: null };

  const separator = literal.indexOf('$');
  if (separator > 0 && separator < literal.length - 1) {
    return {
      literal,
      hash: literal.slice(0, separator),
      domain: literal.slice(separator + 1),
    };
  }

  return {
    literal,
    hash: literal,
    domain: null,
  };
}

export function normalizeRwaIdLiteral(value: string): string | null {
  const literal = value.trim();
  if (!literal || /\s/.test(literal)) return null;

  const { hash, domain } = describeRwaId(literal);
  if (!domain) return null;
  if (!RWA_HASH_PATTERN.test(hash)) return null;
  if (/[#$@]/.test(domain)) return null;

  return `${hash.toLowerCase()}$${domain}`;
}

export function getRwaDomain(value: unknown): string | null {
  return describeRwaId(value).domain;
}
