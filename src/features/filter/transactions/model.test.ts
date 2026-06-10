import { describe, expect, it } from 'vitest';
import { ACCOUNT_TRANSACTIONS_OPTIONS } from './model';

describe('transaction filter model', () => {
  it('exposes tracing tab option for account transaction view', () => {
    expect(ACCOUNT_TRANSACTIONS_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'tracing.nav',
          value: 'tracing',
        }),
      ])
    );
  });
});
