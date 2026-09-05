import { normalizeRwaId as normalizeSdkRwaId } from '@iroha/iroha-js/normalizers';

export interface RwaIdDisplay {
  literal: string;
  hash: string;
  domain: string | null;
}

const RWA_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;
const CANONICAL_DOMAIN_LABEL_PATTERN = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/u;

function isCanonicalDomainComponent(value: string): boolean {
  return (
    CANONICAL_DOMAIN_LABEL_PATTERN.test(value)
    && !(value.length >= 4 && value[2] === '-' && value[3] === '-' && !value.startsWith('xn--'))
  );
}

/** Validate the canonical `DomainId::to_string()` wire form (`domain.dataspace`). */
export function normalizeDomainIdLiteral(value: string): string | null {
  if (value.trim() !== value) return null;
  const segments = value.split('.');
  if (segments.length !== 2) return null;
  const domain = segments[0] ?? '';
  const dataspace = segments[1] ?? '';
  return isCanonicalDomainComponent(domain) && isCanonicalDomainComponent(dataspace) ? value : null;
}

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
  let literal: string;
  try {
    literal = normalizeSdkRwaId(value, 'rwa_id');
  } catch {
    return null;
  }

  const { hash, domain } = describeRwaId(literal);
  if (!domain) return null;
  if (!RWA_HASH_PATTERN.test(hash)) return null;
  const canonicalDomain = normalizeDomainIdLiteral(domain);
  if (!canonicalDomain) return null;

  return `${hash}$${canonicalDomain}`;
}

export function getRwaDomain(value: unknown): string | null {
  return describeRwaId(value).domain;
}
