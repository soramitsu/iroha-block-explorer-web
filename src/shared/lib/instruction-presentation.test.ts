import { describe, expect, it } from 'vitest';
import {
  buildDecodedInstructionPresentation,
  buildInstructionPresentation,
  INSTRUCTION_PRESENTATION_REGISTRY_KEYS,
} from './instruction-presentation';

const ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const ACCOUNT_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const MULTISIG_ACCOUNT =
  'soraﾁｷVMXKﾏtKAoQﾅﾛ3qｾヱ8aﾄdNuｷﾀｱｽh9ｻtWﾐBﾒ9AﾏHｼQﾅvﾛﾌｹYﾑﾐﾛCﾎjtQQヰYCbﾎｵPfb6vXcﾖ1176ﾃﾈcﾐｲUEtﾎヱﾅｻﾀiuｦ2MPﾍﾏiﾌhﾓJｶｶgboCｻBpｷ35ｸ15ｼmGｲFK9NﾑoVﾜWvQMKﾃﾎB7ヰdM99EU4V';
const ASSET_DEFINITION = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const ASSET_ID = `${ASSET_DEFINITION}#${MULTISIG_ACCOUNT}`;
const DOMAIN = 'wonderland.universal';
const NFT = `looking_glass$${DOMAIN}`;
const EXACT_AMOUNT = '90071992547409931234567890.000000000000000001';
const FRAMED_SHA256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const LIVE_TRANSFER_INSTRUCTION =
  'TlJUMAAAhip9dwddTSP/bBJh2wJ4EQDSAQAAAAAAABQKMDTp3Yu+Ag8OaXJvaGEudHJhbnNmZXLAA7gBAAAAAAAATlJUMAAApBdMeNY0H4+Y/Cra6O1nuQCQAQAAAAAAAOy4mMbcuTFWAgIAAACKA6oCggIBAAAA/AEBAQICAPUBAwAAAAAAAABOSiEAAAAAAAAAAQABhAExAb0BZQH/ASQBcwHNAacBpwEHAcEBgAH3AcEB5AH2AcQBzAGVASABPQFuAXoBJwFLAYUBswHtAW8BbAE1AgEATkohAAAAAAAAAAEAAbQBJgHPAXIBUQE3Af8B5gEzAbkB7gFJAXQBIAGoAYIB2gGYAW0BNgGxAfMBgQGPASEBkQFsAdUBtQH9AUoB/QIBAE5KIQAAAAAAAAABAAHHAeIB8QH8AZMBSQHvAZ8BkgG6AYEBeAFSAa4BbQGBAV0B2wGyAWABgQHUAWsBrQHiATMBSwERATwBHwF/AWUCAQAgAW4BFQFrAVABEAHmAUUB+AGDAesBgwEZAUYBuAGNAbgEAAAAAA0HAwAAAKCGAQQAAAAATwAAAABKIQAAAAAAAAABAAH9AVUB7wEWAZIB1QGPAYcBkwEvAVkBgAEhAbEB1gEWATkBRwGAAQgBIwHlAb4BuQF0AcoBiAEEAZoByAGaAfc=';

function explorerInstruction(kind: string, variant: string, value: unknown) {
  return {
    kind,
    box: {
      encoded: '0x01',
      framed_sha256: FRAMED_SHA256,
      json: {
        kind,
        payload: { variant, value },
      },
    },
  };
}

function present(kind: string, variant: string, value: unknown) {
  return buildInstructionPresentation(explorerInstruction(kind, variant, value), 369);
}

describe('instruction presentation registry', () => {
  it('registers every authoritative Explorer standard variant and all multisig variants', () => {
    expect(INSTRUCTION_PRESENTATION_REGISTRY_KEYS).toEqual(
      expect.arrayContaining([
        'Register:Peer',
        'Register:Domain',
        'Register:Account',
        'Register:AssetDefinition',
        'Register:Nft',
        'Register:Role',
        'Register:Trigger',
        'Unregister:Peer',
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
        'SetParameter:SetParameter',
        'Upgrade:ProposeRuntimeUpgrade',
        'Upgrade:ActivateRuntimeUpgrade',
        'Upgrade:CancelRuntimeUpgrade',
        'Upgrade:Upgrade',
        'Log:Log',
        'Shield:Shield',
        'ZkTransfer:ZkTransfer',
        'Unshield:Unshield',
        'KagemushaTopUp:KagemushaTopUp',
        'KagemushaRedeem:KagemushaRedeem',
        'Custom:Register',
        'Custom:Propose',
        'Custom:Approve',
        'Custom:Cancel',
      ])
    );
  });

  it.each([
    ['Register', 'Domain', { object: { id: DOMAIN, logo: null, metadata: {} } }, 'Domain registration'],
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
    ['SetParameter', 'SetParameter', { BlockTime: { ms: 1000 } }, 'Runtime parameter update'],
    ['Upgrade', 'ActivateRuntimeUpgrade', { id: '0x1234' }, 'Runtime upgrade activation'],
    ['Log', 'Log', { level: 'INFO', msg: 'checkpoint' }, 'Log entry'],
    [
      'Shield',
      'Shield',
      { asset: ASSET_DEFINITION, from: ACCOUNT, amount: EXACT_AMOUNT, note_commitment: 'aa', enc_payload: {} },
      'Shield operation',
    ],
    [
      'ZkTransfer',
      'ZkTransfer',
      { asset: ASSET_DEFINITION, inputs: ['aa'], outputs: ['bb'], proof: {}, root_hint: null },
      'Private transfer',
    ],
    [
      'Unshield',
      'Unshield',
      {
        asset: ASSET_DEFINITION,
        to: ACCOUNT,
        public_amount: EXACT_AMOUNT,
        inputs: ['aa'],
        outputs: [],
        proof: {},
        root_hint: null,
      },
      'Unshield operation',
    ],
    [
      'KagemushaTopUp',
      'KagemushaTopUp',
      {
        asset: ASSET_ID,
        amount_atomic_units: EXACT_AMOUNT,
        asset_scale: 18,
        note_commitment: 'aa',
        operation_id: 'bb',
      },
      'Kagemusha top-up',
    ],
    [
      'KagemushaRedeem',
      'KagemushaRedeem',
      {
        asset: ASSET_DEFINITION,
        recipient: ACCOUNT,
        amount_atomic_units: EXACT_AMOUNT,
        asset_scale: 18,
        note_commitment: 'aa',
        operation_id: 'bb',
      },
      'Kagemusha redemption',
    ],
  ])('presents the %s:%s authoritative shape', (kind, variant, value, title) => {
    const result = present(kind, variant, value);

    expect(result?.registryKey).toBe(`${kind}:${variant}`);
    expect(result?.title).toBe(title);
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
    expect(malformed?.fields.find((field) => field.key === 'source')?.link).toBeNull();
    expect(malformed?.fields.find((field) => field.key === 'destination')?.link).toBeNull();

    expect(present('Register', 'Domain', { object: { id: DOMAIN } })?.primaryEntity?.link).toBe(`/domains/${DOMAIN}`);
    expect(present('Unregister', 'Nft', { object: NFT })?.primaryEntity?.link).toBe(`/nfts/${encodeURIComponent(NFT)}`);
    expect(present('Register', 'Domain', { object: { id: '../accounts/injected' } })?.primaryEntity?.link).toBeNull();
  });

  it('rejects legacy, ambiguous, mismatched, and non-string quantity shapes', () => {
    expect(
      buildInstructionPresentation({
        kind: 'Transfer',
        box: {
          encoded: '',
          framed_sha256: FRAMED_SHA256,
          json: { kind: 'Transfer', payload: { source: ASSET_ID, object: '1', destination: ACCOUNT } },
        },
      }, 369)
    ).toBeNull();
    expect(
      buildInstructionPresentation({
        kind: 'Transfer',
        box: {
          encoded: '',
          framed_sha256: FRAMED_SHA256,
          json: {
            kind: 'Transfer',
            payload: { variant: 'Asset', value: { source: ASSET_ID, object: '1', destination: ACCOUNT }, extra: true },
          },
        },
      }, 369)
    ).toBeNull();
    expect(present('Transfer', 'MadeUpVariant', { object: DOMAIN })).toBeNull();
    expect(
      present('Transfer', 'Asset', { source: ASSET_ID, object: 9007199254740992, destination: ACCOUNT })
    ).toBeNull();
    expect(present('Grant', 'PermissionToAccount', { destination: ACCOUNT })).toBeNull();
  });

  it('presents exact Custom Multisig Register, Approve, and Cancel payloads', () => {
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
      Approve: { account: ACCOUNT, instructions_hash: '0xapprove' },
    });
    const cancel = present('Custom', 'Custom', {
      Cancel: { account: ACCOUNT, instructions_hash: '0xcancel' },
    });

    expect(register?.title).toBe('Multisig registration');
    expect(register?.kindLabel).toBe('Multisig');
    expect(register?.fields.find((field) => field.key === 'signatories')?.value).toBe('2');
    expect(approve?.title).toBe('Multisig approval');
    expect(cancel?.title).toBe('Multisig cancellation');
  });

  it('preserves encoded nested Norito instructions without claiming native decoding', () => {
    const result = present('Custom', 'Custom', {
      Propose: {
        account: MULTISIG_ACCOUNT,
        instructions: [LIVE_TRANSFER_INSTRUCTION],
        transaction_ttl_ms: null,
      },
    });

    expect(result?.title).toBe('Multisig proposal');
    expect(result?.nestedInstructions).toHaveLength(1);
    expect(result?.nestedInstructions[0]).toEqual({
      index: 0, encoded: LIVE_TRANSFER_INSTRUCTION, presentation: null,
    });
  });

  it('preserves every encoded nested instruction and its index without treating base64 as decoded JSON', () => {
    const instructions = [LIVE_TRANSFER_INSTRUCTION, '%%%', 'aXJvaGEudHJhbnNmZXI='];
    const result = present('Custom', 'Custom', {
      Propose: { account: MULTISIG_ACCOUNT, instructions, transaction_ttl_ms: 120_000 },
    });
    expect(result?.nestedInstructions).toEqual(instructions.map((encoded, index) => ({
      index, encoded, presentation: null,
    })));
    expect(result?.fields.find(field => field.key === 'ttl')?.value).toBe('120000');
    expect(present('Custom', 'Custom', {
      Propose: { account: MULTISIG_ACCOUNT, instructions: [42], transaction_ttl_ms: null },
    })).toBeNull();
  });

  it('requires one explicit multisig tag and never treats an arbitrary first key as a variant', () => {
    expect(
      present('Custom', 'Custom', {
        Cancel: { account: ACCOUNT, instructions_hash: '0xcancel' },
        extension: { account: ACCOUNT },
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
    }, 369);
    expect(decoded?.registryKey).toBe('Transfer:Asset');
    expect(buildDecodedInstructionPresentation({ Transfer: { Asset: {} }, Register: {} }, 369)).toBeNull();
    expect(buildDecodedInstructionPresentation({ GuessMe: { object: DOMAIN } }, 369)).toBeNull();
  });
});
