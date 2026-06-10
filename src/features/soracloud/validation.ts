import { AccountSelectorSchema } from '@/shared/api/schemas';
import type { SoracloudParsedField, SoracloudValidationError } from './types';

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseSoracloudAccountId(value: string): SoracloudParsedField<string> {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) return { value: undefined, error: null };

  const parsed = AccountSelectorSchema.safeParse(trimmed);
  if (!parsed.success) {
    return {
      value: undefined,
      error: 'invalidAccountId',
    };
  }

  return {
    value: parsed.data,
    error: null,
  };
}

export function parseSoracloudLeaseTermMs(value: string): SoracloudParsedField<number> {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) return { value: undefined, error: null };
  if (!/^\d+$/u.test(trimmed)) return { value: undefined, error: 'invalidLeaseTermMs' };

  try {
    const parsed = BigInt(trimmed);
    if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { value: undefined, error: 'invalidLeaseTermMs' };
    }

    return {
      value: Number(parsed),
      error: null,
    };
  } catch {
    return {
      value: undefined,
      error: 'invalidLeaseTermMs',
    };
  }
}

export function parseSoracloudOptionalHex(value: string): SoracloudParsedField<string> {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) return { value: undefined, error: null };

  const normalized = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/iu.test(normalized)) {
    return {
      value: undefined,
      error: 'invalidHex',
    };
  }

  return {
    value: trimmed,
    error: null,
  };
}

export function soracloudValidationMessageKey(error: SoracloudValidationError): string {
  switch (error) {
    case 'invalidAccountId':
      return 'soracloud.validation.accountId';
    case 'invalidLeaseTermMs':
      return 'soracloud.validation.leaseTermMs';
    case 'invalidHex':
      return 'soracloud.validation.hex';
  }
}
