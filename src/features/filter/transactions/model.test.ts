import { describe, expect, it } from 'vitest';
import { ACCOUNT_TRANSACTIONS_OPTIONS, INSTRUCTION_OPTIONS } from './model';

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

  it('exposes every current Torii base instruction filter including both Kagemusha variants', () => {
    expect(INSTRUCTION_OPTIONS.map((option) => option.value)).toEqual([
      'All',
      'Register',
      'Unregister',
      'Mint',
      'Burn',
      'Transfer',
      'SetKeyValue',
      'RemoveKeyValue',
      'Grant',
      'Revoke',
      'ExecuteTrigger',
      'SetParameter',
      'Upgrade',
      'Log',
      'KagemushaTopUp',
      'KagemushaRedeem',
      'Custom',
    ]);
  });
});
