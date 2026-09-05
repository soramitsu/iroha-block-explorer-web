import { describe, expect, it } from 'vitest';
import {
  buildDecodedInstructionPresentation,
  buildInstructionPresentation,
  INSTRUCTION_PRESENTATION_REGISTRY_KEYS,
  type InstructionPresentationMessage,
} from './instruction-presentation';
import type { Instruction } from '@/shared/api/schemas';
import en from '@/shared/lib/localization/en.json';

const ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const ACCOUNT_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const MULTISIG_ACCOUNT =
  'soraﾁｷVMXKﾏtKAoQﾅﾛ3qｾヱ8aﾄdNuｷﾀｱｽh9ｻtWﾐBﾒ9AﾏHｼQﾅvﾛﾌｹYﾑﾐﾛCﾎjtQQヰYCbﾎｵPfb6vXcﾖ1176ﾃﾈcﾐｲUEtﾎヱﾅｻﾀiuｦ2MPﾍﾏiﾌhﾓJｶｶgboCｻBpｷ35ｸ15ｼmGｲFK9NﾑoVﾜWvQMKﾃﾎB7ヰdM99EU4V';
const ASSET_DEFINITION = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const ASSET_ID = `${ASSET_DEFINITION}#${MULTISIG_ACCOUNT}`;
const DOMAIN = 'wonderland.universal';
const NFT = `looking_glass$${DOMAIN}`;
const EXACT_AMOUNT = '90071992547409931234567890.000000000000000001';
const ATOMIC_AMOUNT = '90071992547409931234567890';
const HASH_LITERAL = `hash:${'11'.repeat(32).toUpperCase()}#4667`;
const NOTE_COMMITMENT = 'aa'.repeat(32);
const OPERATION_ID = 'bb'.repeat(32);
const FRAMED_SHA256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const LIVE_TRANSFER_INSTRUCTION =
  'TlJUMAAAhip9dwddTSP/bBJh2wJ4EQDSAQAAAAAAABQKMDTp3Yu+Ag8OaXJvaGEudHJhbnNmZXLAA7gBAAAAAAAATlJUMAAApBdMeNY0H4+Y/Cra6O1nuQCQAQAAAAAAAOy4mMbcuTFWAgIAAACKA6oCggIBAAAA/AEBAQICAPUBAwAAAAAAAABOSiEAAAAAAAAAAQABhAExAb0BZQH/ASQBcwHNAacBpwEHAcEBgAH3AcEB5AH2AcQBzAGVASABPQFuAXoBJwFLAYUBswHtAW8BbAE1AgEATkohAAAAAAAAAAEAAbQBJgHPAXIBUQE3Af8B5gEzAbkB7gFJAXQBIAGoAYIB2gGYAW0BNgGxAfMBgQGPASEBkQFsAdUBtQH9AUoB/QIBAE5KIQAAAAAAAAABAAHHAeIB8QH8AZMBSQHvAZ8BkgG6AYEBeAFSAa4BbQGBAV0B2wGyAWABgQHUAWsBrQHiATMBSwERATwBHwF/AWUCAQAgAW4BFQFrAVABEAHmAUUB+AGDAesBgwEZAUYBuAGNAbgEAAAAAA0HAwAAAKCGAQQAAAAATwAAAABKIQAAAAAAAAABAAH9AVUB7wEWAZIB1QGPAYcBkwEvAVkBgAEhAbEB1gEWATkBRwGAAQgBIwHlAb4BuQF0AcoBiAEEAZoByAGaAfc=';

function explorerInstruction(kind: Instruction['box']['json']['kind'], variant: string, value: unknown) {
  return {
    kind,
    box: {
      encoded: '0x01',
      framed_sha256: FRAMED_SHA256,
      json: {
        kind,
        payload: { variant, value },
        wire_id: `iroha.${kind.toLowerCase()}`,
        encoded: '01',
      },
    },
  };
}

function present(kind: Instruction['box']['json']['kind'], variant: string, value: unknown) {
  return buildInstructionPresentation(explorerInstruction(kind, variant, value));
}

function localize(message: InstructionPresentationMessage): string {
  const value = message.key.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, en);
  if (typeof value !== 'string') throw new Error(`Missing test locale message: ${message.key}`);
  return Object.entries(message.params ?? {}).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)),
    value
  );
}

describe('instruction presentation registry', () => {
  it('registers only variants with exact semantic schemas, including every current multisig variant', () => {
    expect(INSTRUCTION_PRESENTATION_REGISTRY_KEYS).toEqual([
      'Unregister:Domain',
      'Unregister:Account',
      'Unregister:AssetDefinition',
      'Unregister:Nft',
      'Unregister:Role',
      'Unregister:Trigger',
      'Mint:Asset',
      'Mint:TriggerRepetitions',
      'Burn:Asset',
      'Burn:TriggerRepetitions',
      'Transfer:Domain',
      'Transfer:AssetDefinition',
      'Transfer:Asset',
      'Transfer:Nft',
      'Transfer:AssetBatch',
      'SetKeyValue:Domain',
      'SetKeyValue:Account',
      'SetKeyValue:AssetDefinition',
      'SetKeyValue:Nft',
      'SetKeyValue:Trigger',
      'SetKeyValue:Asset',
      'RemoveKeyValue:Domain',
      'RemoveKeyValue:Account',
      'RemoveKeyValue:AssetDefinition',
      'RemoveKeyValue:Nft',
      'RemoveKeyValue:Trigger',
      'RemoveKeyValue:Asset',
      'Grant:PermissionToAccount',
      'Grant:RoleToAccount',
      'Grant:PermissionToRole',
      'Revoke:PermissionFromAccount',
      'Revoke:RoleFromAccount',
      'Revoke:PermissionFromRole',
      'ExecuteTrigger:ExecuteTrigger',
      'Upgrade:ProposeRuntimeUpgrade',
      'Log:Log',
      'KagemushaTopUp:KagemushaTopUp',
      'KagemushaRedeem:KagemushaRedeem',
      'Custom:Register',
      'Custom:Propose',
      'Custom:Approve',
      'Custom:Cancel',
      'Custom:InvalidateOutstanding',
    ]);
  });

  it.each([
    ['Unregister', 'Nft', { object: NFT }, 'NFT removal'],
    ['Mint', 'Asset', { object: EXACT_AMOUNT, destination: ASSET_ID }, 'Asset mint'],
    ['Burn', 'TriggerRepetitions', { object: 3, destination: 'daily' }, 'Trigger repetition burn'],
    ['Transfer', 'Domain', { source: ACCOUNT, object: DOMAIN, destination: ACCOUNT_ALT }, 'Domain transfer'],
    [
      'SetKeyValue',
      'Account',
      { object: ACCOUNT, key: 'profile', value: { name: 'Alice' } },
      'Account metadata update',
    ],
    ['RemoveKeyValue', 'Nft', { object: NFT, key: 'preview' }, 'NFT metadata removal'],
    [
      'Grant',
      'PermissionToAccount',
      { object: { name: 'CanMintAsset', payload: {} }, destination: ACCOUNT },
      'Account permission grant',
    ],
    ['Revoke', 'RoleFromAccount', { object: 'auditor', destination: ACCOUNT }, 'Account role revocation'],
    ['ExecuteTrigger', 'ExecuteTrigger', { trigger: 'daily', args: { day: 1 } }, 'Trigger execution'],
    ['Upgrade', 'ProposeRuntimeUpgrade', { manifest_bytes: [0, 1, 255] }, 'Runtime upgrade proposal'],
    ['Log', 'Log', { level: 'INFO', msg: 'checkpoint' }, 'Log entry'],
    [
      'KagemushaTopUp',
      'KagemushaTopUp',
      {
        asset: ASSET_DEFINITION,
        amount_atomic_units: ATOMIC_AMOUNT,
        asset_scale: 18,
        note_commitment: NOTE_COMMITMENT,
        operation_id: OPERATION_ID,
      },
      'Kagemusha top-up',
    ],
    [
      'KagemushaRedeem',
      'KagemushaRedeem',
      {
        asset: ASSET_DEFINITION,
        recipient: ACCOUNT,
        amount_atomic_units: ATOMIC_AMOUNT,
        asset_scale: 18,
        note_commitment: NOTE_COMMITMENT,
        operation_id: OPERATION_ID,
      },
      'Kagemusha redemption',
    ],
  ] as const)('presents the %s:%s authoritative shape', (kind, variant, value, title) => {
    const result = present(kind, variant, value);

    expect(result?.registryKey).toBe(`${kind}:${variant}`);
    expect(result && localize(result.title)).toBe(title);
  });

  it('preserves quantity strings exactly and only links validated entities', () => {
    const result = present('Transfer', 'Asset', {
      source: ASSET_ID,
      object: EXACT_AMOUNT,
      destination: ACCOUNT,
    });

    expect(result?.fields.find((field) => field.key === 'amount')?.value).toBe(EXACT_AMOUNT);
    expect(result?.fields.find((field) => field.key === 'source')?.link).toBe(`/assets/${ASSET_DEFINITION}`);
    expect(result?.fields.find((field) => field.key === 'destination')?.link).toBe(
      `/accounts/${encodeURIComponent(ACCOUNT)}`
    );

    const malformed = present('Transfer', 'Asset', {
      source: 'not-an-asset',
      object: EXACT_AMOUNT,
      destination: '/accounts/injected',
    });
    expect(malformed).toBeNull();

    expect(present('Unregister', 'Domain', { object: DOMAIN })?.primaryEntity?.link).toBe(`/domains/${DOMAIN}`);
    expect(present('Unregister', 'Nft', { object: NFT })?.primaryEntity?.link).toBe(`/nfts/${encodeURIComponent(NFT)}`);
    expect(present('Unregister', 'Domain', { object: '../accounts/injected' })).toBeNull();
  });

  it('rejects legacy, ambiguous, mismatched, and non-string quantity shapes', () => {
    expect(
      buildInstructionPresentation({
        kind: 'Transfer',
        box: {
          encoded: '0x01',
          framed_sha256: FRAMED_SHA256,
          json: {
            kind: 'Transfer',
            payload: { source: ASSET_ID, object: '1', destination: ACCOUNT },
            wire_id: 'iroha.transfer',
            encoded: '01',
          },
        },
      } as unknown as Instruction)
    ).toBeNull();
    expect(
      buildInstructionPresentation({
        kind: 'Transfer',
        box: {
          encoded: '0x01',
          framed_sha256: FRAMED_SHA256,
          json: {
            kind: 'Transfer',
            payload: {
              variant: 'Asset',
              value: { source: ASSET_ID, object: '1', destination: ACCOUNT },
              extra: true,
            },
            wire_id: 'iroha.transfer',
            encoded: '01',
          },
        },
      } as unknown as Instruction)
    ).toBeNull();
    expect(present('Transfer', 'MadeUpVariant', { object: DOMAIN })).toBeNull();
    expect(
      present('Transfer', 'Asset', { source: ASSET_ID, object: 9007199254740992, destination: ACCOUNT })
    ).toBeNull();
    expect(present('Grant', 'PermissionToAccount', { destination: ACCOUNT })).toBeNull();
  });

  it('presents all five exact current Custom Multisig payloads', () => {
    const register = present('Custom', 'Custom', {
      Register: {
        account: ACCOUNT,
        home_domain: DOMAIN,
        spec: {
          signatories: { [ACCOUNT]: 1, [ACCOUNT_ALT]: 2 },
          quorum: 2,
          transaction_ttl_ms: 60_000,
        },
      },
    });
    const approve = present('Custom', 'Custom', {
      Approve: { account: ACCOUNT, instructions_hash: HASH_LITERAL },
    });
    const cancel = present('Custom', 'Custom', {
      Cancel: { account: ACCOUNT, instructions_hash: HASH_LITERAL },
    });
    const invalidate = present('Custom', 'Custom', {
      InvalidateOutstanding: { account: ACCOUNT },
    });

    expect(register && localize(register.title)).toBe('Multisig registration');
    expect(register?.kindLabel && localize(register.kindLabel)).toBe('Multisig');
    expect(register?.fields.find((field) => field.key === 'signatories')?.value).toBe('2');
    expect(approve && localize(approve.title)).toBe('Multisig approval');
    expect(cancel && localize(cancel.title)).toBe('Multisig cancellation');
    expect(invalidate && localize(invalidate.title)).toBe('Invalidate multisig proposals');
    expect(invalidate?.primaryEntity?.value).toBe(ACCOUNT);
  });

  it('decodes and presents nested Norito instructions in an exact multisig proposal', () => {
    const result = present('Custom', 'Custom', {
      Propose: {
        account: MULTISIG_ACCOUNT,
        instructions: [LIVE_TRANSFER_INSTRUCTION],
        transaction_ttl_ms: null,
      },
    });

    expect(result && localize(result.title)).toBe('Multisig proposal');
    expect(result?.nestedInstructions).toHaveLength(1);
    expect(result?.nestedInstructions[0]?.presentation?.registryKey).toBe('Transfer:Asset');
    expect(result?.nestedInstructions[0]?.presentation?.fields.find((field) => field.key === 'amount')?.value).toBe(
      '100000'
    );
  });

  it('requires one explicit multisig tag and never treats an arbitrary first key as a variant', () => {
    expect(
      present('Custom', 'Custom', {
        Cancel: { account: ACCOUNT, instructions_hash: HASH_LITERAL },
        extension: { account: ACCOUNT },
      })
    ).toBeNull();
    expect(
      present('Custom', 'Custom', {
        InvalidateOutstanding: { account: ACCOUNT, legacy: true },
      })
    ).toBeNull();
    expect(
      present('Custom', 'Custom', {
        SomethingElse: { account: ACCOUNT },
      })
    ).toBeNull();
  });

  it('presents only whitelisted exact decoded instruction tags', () => {
    const decoded = buildDecodedInstructionPresentation({
      Transfer: {
        Asset: {
          source: ASSET_ID,
          object: EXACT_AMOUNT,
          destination: ACCOUNT,
        },
      },
    });
    expect(decoded?.registryKey).toBe('Transfer:Asset');
    expect(buildDecodedInstructionPresentation({ Transfer: { Asset: {} }, Register: {} })).toBeNull();
    expect(buildDecodedInstructionPresentation({ GuessMe: { object: DOMAIN } })).toBeNull();
  });

  it.each(['Shield', 'ZkTransfer', 'Unshield', 'SetParameter', 'ActivateRuntimeUpgrade'])(
    'keeps unsupported complex %s decoded payloads in the authoritative raw view',
    (kind) => {
      expect(buildDecodedInstructionPresentation({ [kind]: {} })).toBeNull();
    }
  );

  it('presents the exact current batch settlement mode and leg identifiers', () => {
    const result = present('Transfer', 'AssetBatch', {
      mode: { mode: 'Independent', value: null },
      entries: [
        {
          leg_id: 'invoice-42',
          from: ACCOUNT,
          to: ACCOUNT_ALT,
          asset_definition: ASSET_DEFINITION,
          amount: EXACT_AMOUNT,
        },
      ],
    });

    expect(result?.fields.find((item) => item.key === 'mode')?.value).toBe('Independent');
    expect(result?.fields.find((item) => item.key === 'leg-0')?.value).toBe('invoice-42');
    expect(result?.fields.find((item) => item.key === 'asset-0')?.link).toBe(`/assets/${ASSET_DEFINITION}`);
  });

  it('rejects incomplete, legacy, and extended current-family payloads instead of guessing', () => {
    const batchEntry = {
      leg_id: 'leg-1',
      from: ACCOUNT,
      to: ACCOUNT_ALT,
      asset_definition: ASSET_DEFINITION,
      amount: '1',
    };
    expect(present('Transfer', 'AssetBatch', { entries: [batchEntry] })).toBeNull();
    expect(present('Transfer', 'AssetBatch', { mode: 'Atomic', entries: [batchEntry] })).toBeNull();
    expect(
      present('Transfer', 'AssetBatch', {
        mode: { mode: 'Atomic', value: null },
        entries: [{ ...batchEntry, leg_id: undefined }],
      })
    ).toBeNull();
    expect(
      present('Transfer', 'AssetBatch', {
        mode: { mode: 'Atomic', value: null },
        entries: [{ ...batchEntry, extension: true }],
      })
    ).toBeNull();
    expect(
      present('Grant', 'PermissionToAccount', {
        object: { name: 'CanMintAsset', payload: {}, legacy: true },
        destination: ACCOUNT,
      })
    ).toBeNull();
    expect(present('Log', 'Log', { level: 'info', msg: 'checkpoint' })).toBeNull();
    expect(present('Log', 'Log', { level: 'INFO', msg: 'checkpoint', extension: true })).toBeNull();
    expect(present('ExecuteTrigger', 'ExecuteTrigger', { trigger: 'daily', args: {}, extra: true })).toBeNull();
    expect(
      present('KagemushaTopUp', 'KagemushaTopUp', {
        asset: ASSET_DEFINITION,
        amount_atomic_units: '1',
        asset_scale: 18,
        note_commitment: 'aa',
        operation_id: OPERATION_ID,
      })
    ).toBeNull();
    expect(present('Register', 'Domain', { object: { id: DOMAIN, logo: null, metadata: {} } })).toBeNull();
    expect(present('SetParameter', 'SetParameter', { BlockTime: { ms: 1_000 } })).toBeNull();
  });
});
