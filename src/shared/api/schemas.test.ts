import { describe, expect, it } from 'vitest';
import { AccountAddress } from '@iroha/iroha-js/browser';
import { publicKeyFromPrivate, signEd25519 } from '@iroha/iroha-js/crypto';
import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';
import {
  Account,
  AccountQrSnapshot,
  AccountHistorySearchParamsSchema,
  AccountHistoryResponse,
  AccountPermissionsSearchParamsSchema,
  AccountPermissionsResponse,
  Block,
  ExplorerAsset,
  AssetDefinition,
  ExplorerAssetDefinition,
  ConfidentialAssetPolicy,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  ContractCodeView,
  ConnectSessionResponse,
  CursorPagination,
  DetailedTransaction,
  Domain,
  ExplorerHealth,
  HistoryCursorPaginated,
  HistoryCursorParamsSchema,
  HistoryCursorPagination,
  InstructionsSearchParamsSchema,
  Instruction,
  LatestInstructionsResponse,
  LatestTransactionsResponse,
  LedgerStateProof,
  LedgerStateRoot,
  MultisigProposalsQueryResponse,
  MultisigProposalsSearchParamsSchema,
  MultisigSpecResponse,
  NetworkMetrics,
  NFT,
  PeerMetrics,
  RWA,
  NexusDataspacesAccountSummary,
  SorafsPinManifestResponse,
  SorafsPinRegistryResponse,
  SoracleFeedConfig,
  SoracleFeedRegistry,
  SoracleFeedEvent,
  SoracleFeedEventRecord,
  DefiOracleAttestation,
  DefiOracleAttestationLatestParamsSchema,
  SystemParameters,
  Transaction,
  TransactionSearchParamsSchema,
  ZkProofId,
  ZkProofDetail,
  ZkProofRegistryItem,
  ZkVerifyingKeyDetail,
  VpnProfile,
} from './schemas';

const validAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const validAccountIdAlt = 'sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D';
const validAccountIdModern = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const validAssetDefinitionId = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const alternateAssetDefinitionId = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
const validAssetId = `${validAssetDefinitionId}#${validAccountId}`;
const validOraclePrivateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const validOracleSignerPublicKey = Array.from(publicKeyFromPrivate(validOraclePrivateKey));
const validOracleProvider = AccountAddress.fromAccount({
  publicKey: validOracleSignerPublicKey,
  algorithm: 'ed25519',
}).toI105();
const validOracleSignerPublicKeyAlt = Array.from(
  AccountAddress.fromAccountId(validAccountIdAlt).canonicalBytes().slice(-32)
);
const validMultisigProvider =
  'soraﾁｷVMXfkAweDFﾃqSkhXｳrdUｲﾋﾆ4eYqｻｱYsﾐヰｦt4ｵｻｳｷHヰkNﾁｦﾒﾐwjQgmﾜdnｸ9h5BSkヱﾜﾙvｾ6ｻyWtSﾖﾛAｶaヱﾛﾚｻxﾄﾒｼMAyｽ8ｿjDZﾅｲｽMwﾁBﾓヰ9ﾎヰﾛRﾕQｺk3ｷﾆﾘｼmDﾗyiRGﾕfGｺHaﾏVY5phTKQ316';
const compactJsonBytes = (source: string): number[] => Array.from(new TextEncoder().encode(source));
const signOraclePayload = (payload: readonly number[]): number[] =>
  Array.from(signEd25519(Uint8Array.from(payload), validOraclePrivateKey));

const validSystemParameters = {
  sumeragi: {
    block_cadence_ms: 1000,
    max_clock_drift_ms: 50,
    key_activation_lead_blocks: 10,
    key_overlap_grace_blocks: 5,
    key_expiry_grace_blocks: 2,
    key_require_hsm: false,
    key_allowed_algorithms: ['ed25519', 'ml-dsa'],
    key_allowed_hsm_providers: ['pkcs11'],
  },
  block: { max_transactions: 512 },
  transaction: {
    max_signatures: 16,
    max_instructions: 4096,
    ivm_bytecode_size: 1048576,
    max_tx_bytes: 4194304,
    max_decompressed_bytes: 8388608,
    max_metadata_depth: 64,
    max_time_to_live_ms: 86400000,
    require_height_ttl: true,
    require_sequence: true,
  },
  executor: {
    fuel: 55000000,
    memory: 1048576,
    execution_depth: 3,
    max_output_items: 4096,
    max_output_bytes: 8388608,
  },
  smart_contract: {
    fuel: 55000000,
    memory: 1048576,
    execution_depth: 3,
    max_output_items: 4096,
    max_output_bytes: 8388608,
  },
  custom: {
    feature_gate: { id: 'feature_gate', payload: { enabled: true } },
  },
};
const validRwaId = `${'00'.repeat(32)}$commodities.main`;
const validParentRwaId = `${'ff'.repeat(32)}$commodities.main`;
const validFramedInstructionSha256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';
const validTransactionHash = 'a1'.repeat(32);
const rejectionJson = { Validation: 'TooComplex' } as const;
const historyPagination = {
  limit: 10,
  snapshot_height: 101,
  snapshot_hash: 'ab'.repeat(32),
  next_cursor: null,
  has_more: false,
} as const;

const baseInstruction = {
  authority: validAccountId,
  created_at: '2024-01-01T00:00:00Z',
  index: 0,
  transaction_hash: 'ab'.repeat(32),
  transaction_status: 'Committed' as const,
  block: 1,
};

describe('SoraFS finalized pin schemas', () => {
  const digestBytes = Array.from({ length: 32 }, () => 0x19);
  const blockHashBytes = Array.from({ length: 32 }, () => 0xab);
  const rootCidBytes = [1, 0x71, 0x1f, 32, ...Array.from({ length: 32 }, () => 0xcd)];
  const page = {
    finalized_cursor: { height: 42, block_hash: blockHashBytes },
    charged_usage: { manifest_count: 1, content_bytes: 4096 },
    manifests: [
      {
        digest: digestBytes,
        submitted_by: validAccountId,
        submitted_epoch: 3,
        approved_epoch: null,
        content_length: 4096,
        retention_epoch: 99,
        status: { status: 'Pending', value: null },
        successor_of: null,
      },
    ],
    has_more: true,
    next_after_digest: digestBytes,
  };

  it('parses exact finalized keyset pages and native tagged lifecycle values', () => {
    const parsed = SorafsPinRegistryResponse.parse(page);

    expect(parsed.finalized_cursor).toEqual({ height: 42, block_hash: 'ab'.repeat(32) });
    expect(parsed.manifests[0]?.digest).toBe('19'.repeat(32));
    expect(parsed.manifests[0]?.status).toEqual({ state: 'pending', epoch: null });
    expect(parsed.next_after_digest).toBe('19'.repeat(32));
  });

  it('rejects cursor mismatches, inert anchors, and the retired projection shape', () => {
    expect(() => SorafsPinRegistryResponse.parse({ ...page, has_more: false })).toThrow();
    const { next_after_digest: _nextAfterDigest, ...pageWithoutCursor } = page;
    expect(() => SorafsPinRegistryResponse.parse(pageWithoutCursor)).toThrow();
    const { successor_of: _successorOf, ...manifestWithoutSuccessor } = page.manifests[0];
    expect(() => SorafsPinRegistryResponse.parse({ ...page, manifests: [manifestWithoutSuccessor] })).toThrow();
    expect(() =>
      SorafsPinRegistryResponse.parse({
        ...page,
        finalized_cursor: { height: 42, block_hash: Array(32).fill(0) },
      })
    ).toThrow();
    expect(() =>
      SorafsPinRegistryResponse.parse({
        ...page,
        attestation: { block_height: 42, block_hash_hex: 'ab'.repeat(32), chain_id: 'taira' },
      })
    ).toThrow();
    expect(() =>
      SorafsPinRegistryResponse.parse({
        ...page,
        manifests: [{ ...page.manifests[0], status: { status: 'Pending' } }],
      })
    ).toThrow();
  });

  it('parses terminal pages and root manifests with exact native nulls', () => {
    const parsed = SorafsPinRegistryResponse.parse({
      ...page,
      has_more: false,
      next_after_digest: null,
    });

    expect(parsed.next_after_digest).toBeNull();
    expect(parsed.manifests[0]?.successor_of).toBeNull();
  });

  it('parses exact manifest records at their finalized anchor', () => {
    const parsed = SorafsPinManifestResponse.parse({
      finalized_cursor: page.finalized_cursor,
      manifest: {
        digest: digestBytes,
        root_cid: rootCidBytes,
        chunker: {
          profile_id: 1,
          namespace: 'sorafs',
          name: 'sf1',
          semver: '1.0.0',
          multihash_code: 31,
        },
        chunk_digest_sha3_256: Array(32).fill(0x11),
        por_root: Array(32).fill(0x12),
        content_length: 4096,
        policy: {
          min_replicas: 3,
          storage_class: { type: 'Hot', value: null },
          retention_epoch: 99,
        },
        submitted_by: validAccountId,
        submitted_epoch: 3,
        approved_epoch: 4,
        alias: null,
        metadata: { app: 'docs' },
        status: { status: 'Approved', value: 4 },
        council_envelope_digest: null,
      },
    });

    expect(parsed.manifest.root_cid).toBe(`01711f20${'cd'.repeat(32)}`);
    expect(parsed.manifest.policy.storage_class).toBe('hot');
    expect(parsed.manifest.status).toEqual({ state: 'approved', epoch: 4 });
  });

  it('rejects malformed first-release root CIDs and unknown manifest fields', () => {
    const manifest = {
      digest: digestBytes,
      root_cid: rootCidBytes,
      chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
      chunk_digest_sha3_256: Array(32).fill(0x11),
      por_root: Array(32).fill(0x12),
      content_length: 4096,
      policy: { min_replicas: 3, storage_class: { type: 'Hot', value: null }, retention_epoch: 99 },
      submitted_by: validAccountId,
      submitted_epoch: 3,
      approved_epoch: null,
      alias: null,
      metadata: {},
      status: { status: 'Pending', value: null },
      council_envelope_digest: null,
    };

    expect(() =>
      SorafsPinManifestResponse.parse({
        finalized_cursor: page.finalized_cursor,
        manifest: { ...manifest, root_cid: [0, ...rootCidBytes.slice(1)] },
      })
    ).toThrow();
    expect(() =>
      SorafsPinManifestResponse.parse({
        finalized_cursor: page.finalized_cursor,
        manifest: { ...manifest, digest_hex: '19'.repeat(32) },
      })
    ).toThrow();
  });
});

describe('Instruction schema', () => {
  it('rejects legacy instruction json-map payloads', () => {
    expect(() =>
      Instruction.parse({
        ...baseInstruction,
        kind: 'Register',
        box: {
          encoded: '0x01',
          framed_sha256: validFramedInstructionSha256,
          json: {
            Register: {
              object: { type: 'Domain', id: 'wonderland' },
              owner: validAccountId,
            },
          },
        },
      })
    ).toThrow();
  });

  it('requires the exact current {variant, value} Norito instruction payload envelope', () => {
    const buildInstruction = (payload: unknown) => ({
      ...baseInstruction,
      kind: 'Transfer',
      box: {
        encoded: '0x01',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Transfer',
          payload,
          wire_id: 'iroha.transfer',
          encoded: '01',
        },
      },
    });

    for (const payload of [
      { source: validAssetId, object: '1', destination: validAccountIdAlt },
      { variant: 'Asset' },
      { variant: '', value: {} },
      { variant: 'Asset', value: {}, extra: true },
      { variant: 'Asset', value: undefined },
    ]) {
      expect(Instruction.safeParse(buildInstruction(payload)).success).toBe(false);
    }
  });

  it('preserves structured Norito payloads with wire metadata', () => {
    const parsed = Instruction.parse({
      ...baseInstruction,
      kind: 'Transfer',
      box: {
        encoded: '0x02',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Transfer',
          payload: {
            variant: 'Asset',
            value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
          },
          wire_id: 'iroha.transferAsset',
          encoded: 'deadbeef',
        },
      },
    });

    expect(parsed.box.json.kind).toBe('Transfer');
    expect(parsed.box.framed_sha256).toBe(validFramedInstructionSha256);
    expect(parsed.box.json.payload).toEqual({
      variant: 'Asset',
      value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
    });
    expect(parsed.box.json.wire_id).toBe('iroha.transferAsset');
    expect(parsed.box.json.encoded).toBe('deadbeef');
  });

  it('rejects an invented nested instruction kind while keeping top-level custom kinds extensible', () => {
    expect(
      Instruction.safeParse({
        ...baseInstruction,
        kind: 'MintAssetWithMetadata',
        box: {
          encoded: '0x02',
          framed_sha256: validFramedInstructionSha256,
          json: {
            kind: 'MintAssetWithMetadata',
            payload: {},
            wire_id: 'iroha.custom',
            encoded: '02',
          },
        },
      }).success
    ).toBe(false);
  });

  it('rejects missing or malformed canonical instruction evidence', () => {
    const canonicalJson = {
      kind: 'Transfer',
      payload: {
        variant: 'Asset',
        value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
      },
      wire_id: 'iroha.transferAsset',
      encoded: 'deadbeef',
    };

    for (const box of [
      {
        encoded: '',
        framed_sha256: validFramedInstructionSha256,
        json: canonicalJson,
      },
      {
        encoded: '0xDEADBEEF',
        framed_sha256: validFramedInstructionSha256,
        json: canonicalJson,
      },
      {
        encoded: '0xdeadbeef',
        framed_sha256: validFramedInstructionSha256,
        json: { ...canonicalJson, wire_id: '' },
      },
      {
        encoded: '0xdeadbeef',
        framed_sha256: validFramedInstructionSha256,
        json: { ...canonicalJson, encoded: '0xdeadbeef' },
      },
      {
        encoded: '0xdeadbeef',
        framed_sha256: validFramedInstructionSha256,
        json: { kind: canonicalJson.kind, payload: canonicalJson.payload, encoded: canonicalJson.encoded },
      },
    ]) {
      expect(() => Instruction.parse({ ...baseInstruction, kind: 'Transfer', box })).toThrow();
    }
  });

  it('rejects non-canonical instruction hashes and positions', () => {
    const box = {
      encoded: '0xdeadbeef',
      framed_sha256: validFramedInstructionSha256,
      json: {
        kind: 'Transfer',
        payload: {
          variant: 'Asset',
          value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
        },
        wire_id: 'iroha.transferAsset',
        encoded: 'deadbeef',
      },
    };

    for (const override of [
      { transaction_hash: `0x${'ab'.repeat(32)}` },
      { transaction_hash: 'AB'.repeat(32) },
      { block: 0 },
      { block: 1.5 },
      { index: -1 },
      { index: 4_294_967_296 },
    ]) {
      expect(() => Instruction.parse({ ...baseInstruction, kind: 'Transfer', box, ...override })).toThrow();
    }
  });

  it('rejects missing or malformed canonical framed-instruction digests', () => {
    const instruction = {
      ...baseInstruction,
      kind: 'Transfer',
      box: {
        encoded: '0x02',
        json: {
          kind: 'Transfer',
          payload: {
            variant: 'Asset',
            value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
          },
          wire_id: 'iroha.transferAsset',
          encoded: '02',
        },
      },
    };

    expect(() => Instruction.parse(instruction)).toThrow();
    for (const framedSha256 of [
      validFramedInstructionSha256.slice(2),
      '0xC7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43',
      '0xc7e4',
    ]) {
      expect(() =>
        Instruction.parse({
          ...instruction,
          box: {
            ...instruction.box,
            framed_sha256: framedSha256,
          },
        })
      ).toThrow();
    }
  });

  it('rejects the non-canonical Rust identifier r#box', () => {
    expect(() =>
      Instruction.parse({
        ...baseInstruction,
        kind: 'Log',
        'r#box': {
          encoded: '0x03',
          framed_sha256: validFramedInstructionSha256,
          json: {
            kind: 'Log',
            payload: {
              value: { level: 'DEBUG', msg: 'hello' },
              variant: 'Log',
            },
            wire_id: 'iroha_data_model::isi::transparent::Log',
          },
        },
      })
    ).toThrow();
  });

  it('rejects instruction payloads that use scale instead of encoded', () => {
    expect(() =>
      Instruction.parse({
        ...baseInstruction,
        kind: 'Transfer',
        box: {
          scale: '0x04',
          framed_sha256: validFramedInstructionSha256,
          json: {
            kind: 'Transfer',
            payload: {
              variant: 'Asset',
              value: { source: validAssetId, object: '1', destination: validAccountIdAlt },
            },
            wire_id: 'iroha_data_model::isi::transfer::TransferBox',
            encoded: '04',
          },
        },
      })
    ).toThrow();
  });

  it('requires the concrete wire variant as the top-level display kind for unmapped instructions', () => {
    const concrete = {
      ...baseInstruction,
      kind: 'SubmitOfflineToOnlineTransfer',
      box: {
        encoded: '0x05',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Custom',
          payload: {
            variant: 'SubmitOfflineToOnlineTransfer',
            value: {
              wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
              encoded: '05',
            },
          },
          wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
          encoded: '05',
        },
      },
    };

    const parsed = Instruction.parse(concrete);
    expect(() => Instruction.parse({ ...concrete, kind: 'Custom' })).toThrow();

    expect(parsed.kind).toBe('SubmitOfflineToOnlineTransfer');
    expect(parsed.box.json.kind).toBe('Custom');
    expect(parsed.box.json.payload).toEqual({
      variant: 'SubmitOfflineToOnlineTransfer',
      value: {
        wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
        encoded: '05',
      },
    });
  });

  it('derives AddSignatory and canonical CustomInstruction display kinds exactly like Torii', () => {
    const customInstruction = {
      ...baseInstruction,
      kind: 'AddSignatory',
      box: {
        encoded: '0x06',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Custom' as const,
          payload: {
            variant: 'AddSignatory',
            value: {
              wire_id: 'iroha.instruction.v1::account::AddSignatory',
              encoded: '06',
            },
          },
          wire_id: 'iroha.instruction.v1::account::AddSignatory',
          encoded: '06',
        },
      },
    };

    expect(Instruction.parse(customInstruction).kind).toBe('AddSignatory');
    expect(() => Instruction.parse({ ...customInstruction, kind: 'Custom' })).toThrow();

    const genericCustom = {
      ...customInstruction,
      kind: 'Custom',
      box: {
        ...customInstruction.box,
        json: {
          ...customInstruction.box.json,
          wire_id: 'iroha.instruction.v1::custom::CustomInstruction',
        },
      },
    };
    expect(Instruction.parse(genericCustom).kind).toBe('Custom');
  });
});

describe('ledger evidence schemas', () => {
  const commitQc = {
    phase: 'Commit',
    subject_block_hash: 'hash:block',
    parent_state_root: 'hash:parent',
    post_state_root: 'hash:state',
    height: 42,
    view: 7,
    epoch: 3,
    mode_tag: 'sumeragi-v2',
    highest_qc: null,
    validator_set_hash: 'hash:validators',
    validator_set_hash_version: 1,
    validator_set: ['peer-a', 'peer-b'],
    aggregate: {
      signers_bitmap: '03',
      bls_aggregate_signature: 'cafe',
    },
  };

  it('accepts the exact state-root and persisted-QC response shapes', () => {
    expect(
      LedgerStateRoot.parse({
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        source: 'commit_qc',
        commit_qc: commitQc,
      }).source
    ).toBe('commit_qc');

    expect(
      LedgerStateProof.parse({
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        commit_qc: commitQc,
      }).commit_qc.aggregate.signers_bitmap
    ).toBe('03');
  });

  it('accepts a result-root response without a QC but rejects invented sources and extra fields', () => {
    expect(
      LedgerStateRoot.parse({
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        source: 'result_merkle_root',
        commit_qc: null,
      }).commit_qc
    ).toBeNull();

    expect(() =>
      LedgerStateRoot.parse({
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        source: 'fallback',
        commit_qc: null,
      })
    ).toThrow();
    expect(() =>
      LedgerStateProof.parse({
        height: 42,
        block_hash: 'hash:block',
        state_root: 'hash:state',
        commit_qc: commitQc,
        locally_verified: true,
      })
    ).toThrow();
  });
});

describe('Explorer payload schemas', () => {
  it('parses Torii Connect session responses with deeplink URIs and tokens', () => {
    const parsed = ConnectSessionResponse.parse({
      sid: 'sid-1',
      network_id: 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0',
      app_pk: 'app-public-key',
      nonce: 'session-nonce',
      wallet_uri: 'iroha://connect?sid=sid-1',
      app_uri: 'iroha://connect?sid=sid-1&role=app',
      token_app: 'token-app',
      token_wallet: 'token-wallet',
      token_management: 'token-management',
      token_relay: 'token-relay',
    });

    expect(parsed.sid).toBe('sid-1');
    expect(parsed.wallet_uri).toContain('iroha://connect');
    expect(parsed.token_wallet).toBe('token-wallet');
    expect(parsed.token_relay).toBe('token-relay');
  });

  it('rejects pre-NetworkId Connect session shapes', () => {
    expect(() =>
      ConnectSessionResponse.parse({
        sid: 'sid-1',
        wallet_uri: 'iroha://connect?sid=sid-1',
        app_uri: 'iroha://connect?sid=sid-1&role=app',
        token_app: 'token-app',
        token_wallet: 'token-wallet',
        token_relay: 'token-relay',
      })
    ).toThrow();
  });

  it('parses account payloads from the canonical id field', () => {
    const parsed = Account.parse({
      id: validAccountId,
      network_prefix: 0,
      metadata: {},
      owned_domains: 1,
      owned_assets: 2,
      owned_nfts: 3,
    });

    expect(parsed.id).toBe(validAccountId);
    expect(parsed.network_prefix).toBe(0);
  });

  it('parses the exact authoritative account QR snapshot', () => {
    const parsed = AccountQrSnapshot.parse({
      canonicalId: validAccountId,
      literal: validAccountId,
      networkPrefix: 753,
      errorCorrection: 'M',
      modules: 192,
      qrVersion: 8,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
    });

    expect(parsed.literal).toBe(validAccountId);
    expect(parsed.errorCorrection).toBe('M');
    expect(parsed.modules).toBe(192);
  });

  it.each([
    ['mismatched literal', { literal: validAccountIdAlt }],
    ['retired correction level', { errorCorrection: 'L' }],
    ['locally chosen dimensions', { modules: 256 }],
    ['non-SVG image data', { svg: 'data:image/png;base64,AAA' }],
    ['unknown field', { margin: 1 }],
  ])('rejects an inexact account QR snapshot with %s', (_case, override) => {
    expect(
      AccountQrSnapshot.safeParse({
        canonicalId: validAccountId,
        literal: validAccountId,
        networkPrefix: 753,
        errorCorrection: 'M',
        modules: 192,
        qrVersion: 8,
        svg: '<svg/>',
        ...override,
      }).success
    ).toBe(false);
  });

  it.each([
    ['missing network prefix', { network_prefix: undefined }],
    ['retired redundant i105 address', { i105_address: validAccountId }],
    ['retired compressed address', { compressed_address: 'sora5AbCDeFG1234XYZ9876qwerty' }],
    ['unknown field', { alias: 'alice@wonderland.main' }],
  ])('rejects an inexact account DTO with %s', (_case, extra) => {
    const payload = {
      id: validAccountId,
      network_prefix: 753,
      metadata: {},
      owned_domains: 0,
      owned_assets: 1,
      owned_nfts: 0,
      ...extra,
    };

    expect(Account.safeParse(payload).success).toBe(false);
  });

  it.each([
    ['network_prefix', -1],
    ['network_prefix', 65_536],
    ['network_prefix', 1.5],
    ['owned_domains', -1],
    ['owned_assets', 0x1_0000_0000],
    ['owned_nfts', 1.5],
  ])('rejects out-of-range integer field %s=%s', (field, value) => {
    expect(
      Account.safeParse({
        id: validAccountId,
        network_prefix: 753,
        metadata: {},
        owned_domains: 0,
        owned_assets: 1,
        owned_nfts: 0,
        [field]: value,
      }).success
    ).toBe(false);
  });

  it('parses live mixed Base58 + kana i105 account ids from Torii account listings', () => {
    const parsed = Account.parse({
      id: validAccountIdModern,
      network_prefix: 753,
      metadata: { 'iroha:created_via': 'implicit' },
      owned_domains: 0,
      owned_assets: 1,
      owned_nfts: 0,
    });

    expect(parsed.id).toBe(validAccountIdModern);
    expect(parsed.network_prefix).toBe(753);
    expect(parsed.owned_assets).toBe(1);
  });

  it('accepts exact account page inputs and every current history asset-selector variant', () => {
    expect(AccountPermissionsSearchParamsSchema.parse({ page: 25, per_page: 20 })).toEqual({
      page: 25,
      per_page: 20,
    });
    expect(AccountHistorySearchParamsSchema.parse({ page: 1, per_page: 20, asset_id: validAssetId }).asset_id).toBe(
      validAssetId
    );
    expect(
      AccountHistorySearchParamsSchema.parse({ page: 1, per_page: 20, asset_id: validAssetDefinitionId }).asset_id
    ).toBe(validAssetDefinitionId);
    expect(
      AccountHistorySearchParamsSchema.parse({ page: 1, per_page: 20, asset_id: 'usd#issuer.main' }).asset_id
    ).toBe('usd#issuer.main');
  });

  it.each([
    { page: 0, per_page: 20 },
    { page: 1.5, per_page: 20 },
    { page: 26, per_page: 20 },
    { page: 1, per_page: 501 },
    { page: 1, per_page: 20, unexpected: true },
  ])('rejects invalid numbered-page input %#', (params) => {
    expect(() => AccountPermissionsSearchParamsSchema.parse(params)).toThrow();
  });

  it.each([
    { page: 1, per_page: 20, asset_id: ` ${validAssetId}` },
    { page: 1, per_page: 20, asset_id: 'usd' },
    { page: 1, per_page: 20, asset_id: 'usd#issuer.main', unexpected: true },
  ])('rejects an inexact account-history selector request %#', (params) => {
    expect(() => AccountHistorySearchParamsSchema.parse(params)).toThrow();
  });

  it('preserves exact account permission payloads and requires totals in exact mode', () => {
    const parsed = AccountPermissionsResponse.parse({
      items: [
        {
          name: 'CanTransferAssetWithDefinition',
          payload: { asset_definition: validAssetDefinitionId, limit: '100000000000000000001' },
        },
      ],
      total: 1,
      has_more: false,
      count_mode: 'exact',
    });

    expect(parsed.items[0]?.payload).toEqual({
      asset_definition: validAssetDefinitionId,
      limit: '100000000000000000001',
    });
    expect(() =>
      AccountPermissionsResponse.parse({
        items: [],
        has_more: false,
        count_mode: 'exact',
      })
    ).toThrow(/total/u);
    expect(
      AccountPermissionsResponse.safeParse({
        items: [],
        total: 0,
        has_more: false,
        count_mode: 'exact',
        continuation: null,
      }).success
    ).toBe(false);
  });

  it('rejects bounded permission pages because the wrapper requests exact counts', () => {
    expect(() =>
      AccountPermissionsResponse.parse({
        items: [],
        has_more: true,
        count_mode: 'bounded',
      })
    ).toThrow();
  });

  it('preserves exact indexed account-history quantities and evidence fields', () => {
    const parsed = AccountHistoryResponse.parse({
      items: [
        {
          id: 'history:1',
          source: 'asset_transfer',
          type: 'TRANSFER',
          timestamp_ms: 1_700_000_000_123,
          status: 'Committed',
          result_ok: true,
          direction: 'incoming',
          account_id: validAccountId,
          counterparty_account_id: validAccountIdAlt,
          asset_id: validAssetId,
          asset_definition_id: validAssetDefinitionId,
          amount: '100000000000000000001.000000000000000001',
          tx_hash: 'ab'.repeat(32),
        },
      ],
      total: 1,
      has_more: false,
      count_mode: 'exact',
      indexed_height: 42,
      indexed_block_hash: 'cd'.repeat(32),
      query_source: 'account_history_index',
    });

    expect(parsed.items[0]?.amount).toBe('100000000000000000001.000000000000000001');
    expect(parsed.query_source).toBe('account_history_index');
    if (parsed.query_source !== 'account_history_index') {
      throw new Error('Expected a single-route account-history index response');
    }
    expect(parsed.indexed_height).toBe(42);
    expect(() =>
      AccountHistoryResponse.parse({
        ...parsed,
        items: [{ ...parsed.items[0], amount: 10 }],
      })
    ).toThrow();
  });

  it('accepts only exact multi-route account-history fanout envelopes', () => {
    const exact = AccountHistoryResponse.parse({
      items: [],
      total: 0,
      has_more: false,
      count_mode: 'exact',
      query_source: 'account_history_fanout',
    });
    expect(exact.query_source).toBe('account_history_fanout');
    expect('indexed_height' in exact).toBe(false);
    expect(
      AccountHistoryResponse.safeParse({
        items: [],
        has_more: true,
        count_mode: 'bounded',
        query_source: 'account_history_fanout',
      }).success
    ).toBe(false);
  });

  it.each([
    {
      name: 'single-route response without required index metadata',
      response: {
        items: [],
        total: 0,
        has_more: false,
        count_mode: 'exact',
        query_source: 'account_history_index',
      },
    },
    {
      name: 'fanout response carrying single-route index metadata',
      response: {
        items: [],
        total: 0,
        has_more: false,
        count_mode: 'exact',
        indexed_height: 42,
        indexed_block_hash: 'cd'.repeat(32),
        query_source: 'account_history_fanout',
      },
    },
  ])('rejects $name', ({ response }) => {
    expect(() => AccountHistoryResponse.parse(response)).toThrow();
  });

  it.each([
    {
      query_source: 'account_history_index',
      indexed_height: 42,
      indexed_block_hash: 'cd'.repeat(32),
    },
    {
      query_source: 'account_history_fanout',
    },
  ])('requires exact $query_source responses to include total', (source) => {
    expect(() =>
      AccountHistoryResponse.parse({
        items: [],
        has_more: false,
        count_mode: 'exact',
        ...source,
      })
    ).toThrow(/total/u);
  });

  it('accepts exact multisig query filters including the initial null cursor', () => {
    expect(
      MultisigProposalsSearchParamsSchema.parse({
        status: ['COLLECTING_SIGNATURES', 'FINALIZED'],
        cursor: null,
        limit: 100,
      })
    ).toEqual({ status: ['COLLECTING_SIGNATURES', 'FINALIZED'], cursor: null, limit: 100 });
  });

  it.each([
    { status: ['finalized'] },
    { status: ['FINALIZED', 'FINALIZED'] },
    { status: ['COLLECTING_SIGNATURES', 'FINALIZED', 'CANCELED', 'EXPIRED', 'FINALIZED'] },
    { cursor: 'A'.repeat(513) },
    { cursor: 'cursor=' },
    { limit: 0 },
    { limit: 101 },
    { unexpected: true },
  ])('rejects an inexact multisig proposal query %#', (params) => {
    expect(() => MultisigProposalsSearchParamsSchema.parse(params)).toThrow();
  });

  it('parses strict multisig specs and decoded proposal instructions', () => {
    const spec = MultisigSpecResponse.parse({
      resolved_multisig_account_id: validAccountId,
      spec: {
        signatories: { [validAccountId]: 2, [validAccountIdAlt]: 1 },
        quorum: 2,
        transaction_ttl_ms: 60_000,
      },
    });
    const proposals = MultisigProposalsQueryResponse.parse({
      resolved_multisig_account_id: validAccountId,
      proposals: [
        {
          proposal_id: 'aa'.repeat(32),
          instructions_hash: 'aa'.repeat(32),
          operation_type: 'TRANSFER',
          intent: null,
          proposal: {
            instructions: [
              {
                Transfer: {
                  Asset: {
                    source: validAccountId,
                    object: validAssetId,
                    destination: validAccountIdAlt,
                  },
                },
              },
            ],
            proposed_at_ms: 1_700_000_000_000,
            expires_at_ms: 1_700_000_060_000,
            approvals: [validAccountId],
            is_relayed: null,
          },
          status: 'COLLECTING_SIGNATURES',
          terminal_at_ms: null,
        },
      ],
      next_cursor: 'cursor_2',
    });

    expect(spec.spec.signatories[validAccountId]).toBe(2);
    expect(proposals.proposals[0]?.proposal.instructions[0]).toHaveProperty('Transfer.Asset');
    expect(() =>
      MultisigProposalsQueryResponse.parse({
        ...proposals,
        proposals: [{ ...proposals.proposals[0], status: 'READY' }],
      })
    ).toThrow();
  });

  it('rejects account response ids that require whitespace normalization', () => {
    expect(
      Account.safeParse({
        id: ` ${validAccountId}`,
        network_prefix: 0,
        metadata: {},
        owned_domains: 1,
        owned_assets: 2,
        owned_nfts: 3,
      }).success
    ).toBe(false);
  });

  it('requires account metadata to contain JSON values', () => {
    expect(
      Account.safeParse({
        id: validAccountId,
        network_prefix: 0,
        metadata: { invalid: undefined },
        owned_domains: 1,
        owned_assets: 2,
        owned_nfts: 3,
      }).success
    ).toBe(false);
  });

  it('parses explorer health payloads', () => {
    const parsed = ExplorerHealth.parse({
      head_height: 77,
      head_created_at: '2026-03-05T06:00:00Z',
      sampled_at: '2026-03-05T06:00:01Z',
    });

    expect(parsed.head_height).toBe(77);
    expect(parsed.head_created_at?.toISOString()).toBe('2026-03-05T06:00:00.000Z');
    expect(parsed.sampled_at.toISOString()).toBe('2026-03-05T06:00:01.000Z');
  });

  it('accepts the canonical zero discriminant in account QR responses', () => {
    const parsed = AccountQrSnapshot.parse({
      canonicalId: validAccountId,
      literal: validAccountId,
      networkPrefix: 0,
      errorCorrection: 'M',
      modules: 192,
      qrVersion: 8,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });

    expect(parsed.networkPrefix).toBe(0);
  });

  it('rejects imprecise and unknown core Explorer transaction, block, and health fields', () => {
    const transaction = {
      authority: validAccountId,
      hash: validTransactionHash,
      block: 1,
      created_at: '2026-03-05T06:00:01Z',
      executable: 'Instructions' as const,
      status: 'Committed' as const,
    };
    const block = {
      hash: 'b1'.repeat(32),
      height: 1,
      created_at: '2026-03-05T06:00:00Z',
      prev_block_hash: null,
      transactions_hash: 'b2'.repeat(32),
      transactions_rejected: 0,
      transactions_total: 1,
    };
    const health = {
      head_height: 1,
      head_created_at: '2026-03-05T06:00:00Z',
      sampled_at: '2026-03-05T06:00:01Z',
    };

    expect(Transaction.parse(transaction).hash).toBe(validTransactionHash);
    expect(Block.parse(block).height).toBe(1);
    expect(Transaction.safeParse({ ...transaction, hash: `0x${validTransactionHash}` }).success).toBe(false);
    expect(Transaction.safeParse({ ...transaction, block: 1.5 }).success).toBe(false);
    expect(Transaction.safeParse({ ...transaction, unknown: true }).success).toBe(false);
    expect(Block.safeParse({ ...block, transactions_total: 1.5 }).success).toBe(false);
    expect(Block.safeParse({ ...block, prev_block_hash: 'B1'.repeat(32) }).success).toBe(false);
    expect(Block.safeParse({ ...block, unknown: true }).success).toBe(false);
    expect(ExplorerHealth.safeParse({ ...health, head_height: -1 }).success).toBe(false);
    expect(ExplorerHealth.safeParse({ ...health, head_height: 1.5 }).success).toBe(false);
    expect(ExplorerHealth.safeParse({ ...health, unknown: true }).success).toBe(false);
  });

  it('accepts the signed hash-only committed-journal block and does not mislabel inconsistent empty timestamps', () => {
    const hashOnly = {
      hash: 'b1'.repeat(32),
      height: 2,
      created_at: '',
      prev_block_hash: 'b0'.repeat(32),
      transactions_hash: null,
      transactions_rejected: 0,
      transactions_total: 0,
    };

    expect(Block.parse(hashOnly).created_at).toBeNull();
    expect(Block.safeParse({ ...hashOnly, transactions_hash: 'b2'.repeat(32) }).success).toBe(false);
    expect(Block.safeParse({ ...hashOnly, transactions_total: 1 }).success).toBe(false);
    expect(Block.safeParse({ ...hashOnly, created_at: null }).success).toBe(false);
  });

  it('accepts only RFC 3339 strings at every Explorer timestamp boundary', () => {
    const transaction = {
      authority: validAccountId,
      hash: validTransactionHash,
      block: 1,
      created_at: 0,
      executable: 'Instructions' as const,
      status: 'Committed' as const,
    };
    const network = {
      peers: 1,
      domains: 1,
      accounts: 1,
      assets: 1,
      transactions_accepted: 1,
      transactions_rejected: 0,
      block: 1,
      block_created_at: 0,
      finalized_block: 1,
      avg_commit_time: null,
      avg_block_time: null,
    };
    const instruction = {
      ...baseInstruction,
      created_at: 0,
      kind: 'Register',
      box: {
        encoded: '0x01',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Register',
          payload: { variant: 'Domain', value: {} },
          wire_id: 'iroha.register',
          encoded: '01',
        },
      },
    };

    expect(Transaction.safeParse(transaction).success).toBe(false);
    expect(ExplorerHealth.safeParse({ head_height: 1, head_created_at: 0, sampled_at: 0 }).success).toBe(false);
    expect(
      LatestTransactionsResponse.safeParse({ sampled_at: 0, pagination: historyPagination, items: [] }).success
    ).toBe(false);
    expect(
      Block.safeParse({
        hash: 'b1'.repeat(32),
        height: 1,
        created_at: 0,
        prev_block_hash: null,
        transactions_hash: null,
        transactions_rejected: 0,
        transactions_total: 0,
      }).success
    ).toBe(false);
    expect(NetworkMetrics.safeParse(network).success).toBe(false);
    expect(Instruction.safeParse(instruction).success).toBe(false);
    expect(
      LatestInstructionsResponse.safeParse({ sampled_at: 0, pagination: historyPagination, items: [] }).success
    ).toBe(false);
    expect(Transaction.safeParse({ ...transaction, created_at: '2026-02-30T00:00:00Z' }).success).toBe(false);
  });

  it('parses latest transaction snapshots', () => {
    const parsed = LatestTransactionsResponse.parse({
      sampled_at: '2026-03-05T06:00:02Z',
      pagination: historyPagination,
      items: [
        {
          authority: validAccountId,
          hash: validTransactionHash,
          block: 99,
          created_at: '2026-03-05T06:00:01Z',
          executable: 'Instructions',
          status: 'Committed',
        },
      ],
    });

    expect(parsed.items[0]?.hash).toBe(validTransactionHash);
  });

  it('preserves halfwidth latest transaction authorities from Torii', () => {
    const parsed = LatestTransactionsResponse.parse({
      sampled_at: '2026-03-05T06:00:02Z',
      pagination: historyPagination,
      items: [
        {
          authority: validAccountId,
          hash: 'a2'.repeat(32),
          block: 100,
          created_at: '2026-03-05T06:00:01Z',
          executable: 'Instructions',
          status: 'Committed',
        },
      ],
    });

    expect(parsed.items[0]?.authority).toBe(validAccountId);
  });

  it('rejects noncanonical fullwidth latest transaction authorities', () => {
    expect(() =>
      LatestTransactionsResponse.parse({
        sampled_at: '2026-03-05T06:00:02Z',
        pagination: historyPagination,
        items: [
          {
            authority: 'sorauロ1NラhBUd2BツヲトiヤニツヌKSテaリメモQラrメoリナnウリbQウQJニLJ5HSE',
            hash: 'a3'.repeat(32),
            block: 101,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      })
    ).toThrow();
  });

  it('parses snapshot-bound transaction history with live mixed Base58 + kana authority ids', () => {
    const parsed = HistoryCursorPaginated(Transaction).parse({
      pagination: historyPagination,
      items: [
        {
          authority: validAccountIdModern,
          hash: 'a4'.repeat(32),
          block: 37,
          created_at: '2026-03-28T18:44:03.003Z',
          executable: 'Instructions',
          status: 'Rejected',
        },
      ],
    });

    expect(parsed.items[0]?.authority).toBe(validAccountIdModern);
    expect(parsed.items[0]?.hash).toBe('a4'.repeat(32));
  });

  it('parses latest instruction snapshots', () => {
    const parsed = LatestInstructionsResponse.parse({
      sampled_at: '2026-03-05T06:00:02Z',
      pagination: historyPagination,
      items: [
        {
          ...baseInstruction,
          kind: 'Register',
          box: {
            encoded: '0x01',
            framed_sha256: validFramedInstructionSha256,
            json: {
              kind: 'Register',
              payload: {
                variant: 'Domain',
                value: {
                  object: { type: 'Domain', id: 'wonderland' },
                  owner: validAccountId,
                },
              },
              wire_id: 'iroha_data_model::isi::RegisterBox',
              encoded: '01',
            },
          },
        },
      ],
    });

    expect(parsed.items[0]?.kind).toBe('Register');
  });

  it('enforces exact snapshot binding and cursor invariants', () => {
    expect(HistoryCursorPagination.parse(historyPagination).snapshot_height).toBe(101);
    expect(HistoryCursorPagination.safeParse({ ...historyPagination, snapshot_height: 0 }).success).toBe(false);
    expect(HistoryCursorPagination.safeParse({ ...historyPagination, snapshot_hash: null }).success).toBe(false);
    expect(
      HistoryCursorPagination.safeParse({ ...historyPagination, next_cursor: 'next_cursor', has_more: false }).success
    ).toBe(false);
  });

  it("enforces Torii's distinct world and history cursor byte ceilings", () => {
    const worldCursorAtLimit = 'w'.repeat(1424);
    const historyCursorAtLimit = 'h'.repeat(192);

    expect(CursorPagination.safeParse({ limit: 10, next_cursor: worldCursorAtLimit, has_more: true }).success).toBe(
      true
    );
    expect(
      CursorPagination.safeParse({ limit: 10, next_cursor: `${worldCursorAtLimit}w`, has_more: true }).success
    ).toBe(false);
    expect(
      HistoryCursorPagination.safeParse({
        ...historyPagination,
        next_cursor: historyCursorAtLimit,
        has_more: true,
      }).success
    ).toBe(true);
    expect(
      HistoryCursorPagination.safeParse({
        ...historyPagination,
        next_cursor: `${historyCursorAtLimit}h`,
        has_more: true,
      }).success
    ).toBe(false);
  });

  it('rejects oversized history cursors in every history request shape', () => {
    const cursor = 'h'.repeat(193);

    expect(HistoryCursorParamsSchema.safeParse({ cursor }).success).toBe(false);
    expect(TransactionSearchParamsSchema.safeParse({ cursor }).success).toBe(false);
    expect(InstructionsSearchParamsSchema.safeParse({ cursor }).success).toBe(false);
  });

  it('accepts the canonical empty-chain history snapshot and rejects oversized pages', () => {
    const emptyPagination = { ...historyPagination, snapshot_height: 0, snapshot_hash: null };
    expect(HistoryCursorPagination.parse(emptyPagination).snapshot_hash).toBeNull();
    expect(
      HistoryCursorPaginated(Transaction).safeParse({
        pagination: { ...emptyPagination, limit: 1 },
        items: [
          {
            authority: validAccountId,
            hash: 'ab'.repeat(32),
            block: 1,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Batch',
            status: 'Committed',
          },
          {
            authority: validAccountId,
            hash: 'cd'.repeat(32),
            block: 1,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Batch',
            status: 'Committed',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('parses contract code views with verified-source provenance', () => {
    const parsed = ContractCodeView.parse({
      code_hash: 'aa'.repeat(32),
      declared_code_hash: 'bb'.repeat(32),
      abi_hash: 'cc'.repeat(32),
      compiler_fingerprint: 'kotodama-1.0',
      byte_len: 96,
      permissions: ['CanTransfer'],
      access_hints: {
        read_keys: ['accounts/alice'],
        write_keys: ['assets/usd'],
      },
      entrypoints: [
        {
          name: 'main',
          kind: 'public',
          params: [],
          read_keys: [],
          write_keys: [],
          access_hints_complete: true,
          access_hints_skipped: [],
          triggers: [],
        },
      ],
      analysis: {
        instruction_count: 8,
        memory: {
          load64: 1,
          store64: 2,
          load128: 0,
          store128: 0,
        },
        syscalls: [],
      },
      warnings: ['Historical reconstruction'],
      rendered_source_kind: 'verified_source',
      rendered_source_text: 'kotoage fn main() {}',
      verified_source_ref: {
        language: 'kotodama',
        source_name: 'demo.ko',
        submitted_at: '2026-03-28T00:00:00Z',
        manifest_id_hex: 'dd'.repeat(16),
        payload_digest_hex: 'ee'.repeat(32),
        content_length: 44,
      },
    });

    expect(parsed.rendered_source_kind).toBe('verified_source');
    expect(parsed.verified_source_ref?.source_name).toBe('demo.ko');
    expect(parsed.entrypoints[0]?.name).toBe('main');
  });

  it('rejects nullable, imprecise, and unknown contract-view wire fields', () => {
    const minimalView = {
      code_hash: 'aa'.repeat(32),
      permissions: [],
      entrypoints: [
        {
          name: 'main',
          kind: 'public',
          params: [],
          read_keys: [],
          write_keys: [],
          access_hints_skipped: [],
          triggers: [],
        },
      ],
      warnings: [],
      rendered_source_kind: 'manifest_stub' as const,
      rendered_source_text: 'seiyaku Contract {}',
    };

    expect(ContractCodeView.parse(minimalView).declared_code_hash).toBeUndefined();
    expect(ContractCodeView.safeParse({ ...minimalView, declared_code_hash: null }).success).toBe(false);
    expect(ContractCodeView.safeParse({ ...minimalView, byte_len: 1.5 }).success).toBe(false);
    expect(ContractCodeView.safeParse({ ...minimalView, code_hash: 'AA'.repeat(32) }).success).toBe(false);
    expect(ContractCodeView.safeParse({ ...minimalView, unknown: true }).success).toBe(false);
    expect(
      ContractCodeView.safeParse({
        ...minimalView,
        entrypoints: [{ ...minimalView.entrypoints[0], return_type: null }],
      }).success
    ).toBe(false);
    expect(
      ContractCodeView.safeParse({
        ...minimalView,
        analysis: {
          instruction_count: 1,
          memory: { load64: 0, store64: 0, load128: 0, store128: 0 },
          syscalls: [{ number: 1.5, count: 1 }],
        },
      }).success
    ).toBe(false);
  });

  it('requires explicit nullable verified-source reference fields', () => {
    const reference = {
      language: 'kotodama',
      source_name: null,
      submitted_at: '2026-03-28T00:00:00Z',
      manifest_id_hex: null,
      payload_digest_hex: null,
      content_length: null,
    };
    const minimalView = {
      code_hash: 'aa'.repeat(32),
      permissions: [],
      entrypoints: [],
      warnings: [],
      rendered_source_kind: 'verified_source' as const,
      rendered_source_text: 'seiyaku Contract {}',
      verified_source_ref: reference,
    };

    expect(ContractCodeView.parse(minimalView).verified_source_ref?.source_name).toBeNull();
    const { source_name: _sourceName, ...withoutSourceName } = reference;
    expect(ContractCodeView.safeParse({ ...minimalView, verified_source_ref: withoutSourceName }).success).toBe(false);
  });

  it('accepts Ivm executable values in transaction payloads', () => {
    const parsed = Transaction.parse({
      authority: validAccountId,
      hash: 'b1'.repeat(32),
      block: 7,
      created_at: '2026-02-24T09:28:58.03Z',
      executable: 'Ivm',
      status: 'Committed',
    });

    expect(parsed.executable).toBe('Ivm');
  });

  it('accepts IvmProved executable values in transaction payloads', () => {
    const parsed = Transaction.parse({
      authority: validAccountId,
      hash: 'b2'.repeat(32),
      block: 8,
      created_at: '2026-02-24T09:29:58.03Z',
      executable: 'IvmProved',
      status: 'Committed',
    });

    expect(parsed.executable).toBe('IvmProved');
  });

  it('accepts ContractCall executable values in transaction payloads', () => {
    const parsed = Transaction.parse({
      authority: validAccountId,
      hash: 'b3'.repeat(32),
      block: 9,
      created_at: '2026-02-24T09:30:58.03Z',
      executable: 'ContractCall',
      status: 'Committed',
    });

    expect(parsed.executable).toBe('ContractCall');
  });

  it('accepts Batch and rejects the retired Wasm executable label', () => {
    const payload = {
      authority: validAccountId,
      hash: 'b4'.repeat(32),
      block: 10,
      created_at: '2026-02-24T09:31:58.03Z',
      executable: 'Batch' as const,
      status: 'Committed' as const,
    };

    expect(Transaction.parse(payload).executable).toBe('Batch');
    expect(Transaction.safeParse({ ...payload, executable: 'Wasm' }).success).toBe(false);
  });

  it('parses the exact optional peer_info fields from telemetry SSE', () => {
    const payload = {
      kind: 'first',
      network_status: {
        peers: 4,
        domains: 7,
        accounts: 58,
        assets: 27,
        transactions_accepted: 953,
        transactions_rejected: 69,
        block: 897,
        block_created_at: '2026-04-18T06:39:20.309Z',
        finalized_block: 897,
        avg_commit_time: { ms: 1197 },
        avg_block_time: { ms: 8316 },
      },
      peers_info: [
        {
          url: 'http://127.0.0.1:29080/',
          connected: true,
          telemetry_unsupported: false,
          config: {},
        },
      ],
      peers_status: [],
      propagation: [],
    } as const;
    const parsed = PeerMetrics.parse(payload);

    expect(parsed.kind).toBe('first');
    if (parsed.kind !== 'first') {
      throw new Error('expected first telemetry payload');
    }
    expect(parsed.peers_info[0]?.config).toEqual({});
    expect(parsed.peers_info[0]?.location).toBeUndefined();
    expect(parsed.peers_info[0]?.connected_peers).toBeUndefined();
    expect(PeerMetrics.safeParse({ ...payload, propagation: undefined }).success).toBe(false);
  });

  it('rejects nullable, partial, unknown, and fractional telemetry wire values', () => {
    const peer = {
      kind: 'peer_info' as const,
      url: 'https://peer.example',
      connected: true,
      telemetry_unsupported: false,
    };
    expect(PeerMetrics.safeParse({ ...peer, config: null }).success).toBe(false);
    expect(PeerMetrics.safeParse({ ...peer, location: { city: 'Tokyo' } }).success).toBe(false);
    expect(PeerMetrics.safeParse({ ...peer, retired_field: true }).success).toBe(false);
    expect(
      PeerMetrics.safeParse({
        kind: 'propagation',
        block: 1.5,
        first_seen_at_ms: 1,
        last_seen_at_ms: 2,
        spread_ms: 1,
        peers_reported: 1,
      }).success
    ).toBe(false);
    expect(
      PeerMetrics.safeParse({
        kind: 'peer_status',
        url: 'https://peer.example',
        block: 1,
        commit_time: { ms: 1 },
        avg_commit_time: { ms: 1 },
        status_rtt: null,
        queue_size: 0,
        uptime: { ms: 1 },
      }).success
    ).toBe(false);
  });

  it('parses the exact public VPN profile and its complete relay trust tuple', () => {
    const parsed = VpnProfile.parse({
      available: true,
      relay_endpoint: '/dns/relay.example/udp/9443/quic',
      supported_exit_classes: ['standard', 'low-latency', 'high-security'],
      default_exit_class: 'standard',
      lease_secs: 3600,
      dns_push_interval_secs: 60,
      meter_family: 'soranet-v1',
      route_pushes: ['0.0.0.0/0', '::/0'],
      excluded_routes: ['10.0.0.0/8'],
      dns_servers: ['1.1.1.1'],
      tunnel_addresses: ['10.10.0.2/32'],
      mtu_bytes: 1280,
      display_billing_label: 'standard · soranet-v1 · 1 XOR',
      operator_account_id: validAccountId,
      lease_fee: '1',
      settlement_grace_secs: 300,
      flow_label_bits: 24,
      padding_budget_ms: 250,
      relay_id_hex: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      relay_mldsa65_public_key_hex: '5a'.repeat(1952),
      descriptor_commit_hex: 'cd'.repeat(32),
      tls_server_name: 'relay.example',
      relay_tls_spki_sha256_hex: 'ab'.repeat(32),
      relay_certificate_sha256_hex: 'ef'.repeat(32),
      directory_snapshot_digest_hex: '42'.repeat(32),
    });

    expect(parsed.available).toBe(true);
    expect(parsed.relay_endpoint).toBe('/dns/relay.example/udp/9443/quic');
    expect(parsed.lease_fee.toString()).toBe('1');
  });

  it('accepts the exact unavailable VPN profile and rejects partial or malformed trust state', () => {
    const unavailable = {
      available: false,
      relay_endpoint: '',
      supported_exit_classes: ['standard', 'low-latency', 'high-security'],
      default_exit_class: 'standard',
      lease_secs: 3600,
      dns_push_interval_secs: 60,
      meter_family: 'soranet-v1',
      route_pushes: [],
      excluded_routes: [],
      dns_servers: [],
      tunnel_addresses: [],
      mtu_bytes: 1280,
      display_billing_label: 'standard · soranet-v1 · 1 XOR',
      operator_account_id: validAccountId,
      lease_fee: '1',
      settlement_grace_secs: 300,
      flow_label_bits: 24,
      padding_budget_ms: 250,
      relay_id_hex: '',
      relay_mldsa65_public_key_hex: '',
      descriptor_commit_hex: '',
      tls_server_name: '',
      relay_tls_spki_sha256_hex: '',
      relay_certificate_sha256_hex: '',
      directory_snapshot_digest_hex: '',
    } as const;

    expect(VpnProfile.parse(unavailable).available).toBe(false);
    expect(
      VpnProfile.safeParse({
        ...unavailable,
        relay_endpoint: '/dns/relay.example/udp/9443/quic',
      }).success
    ).toBe(false);
    expect(
      VpnProfile.safeParse({
        ...unavailable,
        available: true,
        relay_endpoint: '/dns/Relay.example/udp/9443/quic',
      }).success
    ).toBe(false);
    expect(
      VpnProfile.safeParse({
        ...unavailable,
        supported_exit_classes: ['standard', 'standard', 'high-security'],
      }).success
    ).toBe(false);
    expect(VpnProfile.safeParse({ ...unavailable, retired_metrics: {} }).success).toBe(false);
  });

  it('parses NFTs that expose metadata under the latest Torii key', () => {
    const parsed = NFT.parse({
      id: 'cool-cat$gallery.main',
      owned_by: validAccountId,
      metadata: { rarity: 'legendary' },
    });

    expect(parsed.metadata).toEqual({ rarity: 'legendary' });
  });

  it.each([
    ['unqualified domain', 'cool-cat$gallery'],
    ['leading whitespace', ' cool-cat$gallery.main'],
    ['noncanonical domain case', 'cool-cat$Gallery.main'],
    ['invalid NFT name', 'cool cat$gallery.main'],
  ])('rejects a noncanonical NFT response id with %s', (_case, id) => {
    expect(NFT.safeParse({ id, owned_by: validAccountId, metadata: {} }).success).toBe(false);
  });

  it('rejects unknown and missing NFT response fields', () => {
    expect(
      NFT.safeParse({ id: 'cool-cat$gallery.main', owned_by: validAccountId, metadata: {}, content: {} }).success
    ).toBe(false);
    expect(NFT.safeParse({ id: 'cool-cat$gallery.main', owned_by: validAccountId }).success).toBe(false);
  });

  it('parses the exact RWA DTO with canonical parent references', () => {
    const parsed = RWA.parse({
      id: validRwaId,
      owned_by: validAccountId,
      quantity: '42.5',
      held_quantity: '2.5',
      primary_reference: 'vault://receipts/2',
      status: null,
      is_frozen: true,
      metadata: { warehouse: 'east' },
      parents: [
        {
          rwa: validParentRwaId,
          quantity: '40',
        },
      ],
    });

    expect(parsed.id).toBe(validRwaId);
    expect(parsed.quantity.toString()).toBe('42.5');
    expect(parsed.held_quantity.toString()).toBe('2.5');
    expect(parsed.status).toBeNull();
    expect(parsed.is_frozen).toBe(true);
    expect(parsed.metadata).toEqual({ warehouse: 'east' });
    expect(parsed.parents).toHaveLength(1);
    expect(parsed.parents[0]?.rwa).toBe(validParentRwaId);
    expect(parsed.parents[0]?.quantity.toString()).toBe('40');
  });

  it.each([
    ['missing status', { status: undefined }],
    ['missing metadata', { metadata: undefined }],
    ['null metadata', { metadata: null }],
    ['missing parents', { parents: undefined }],
    ['null parents', { parents: null }],
    ['unknown field', { controller: validAccountId }],
  ])('rejects an inexact RWA DTO with %s', (_case, replacement) => {
    expect(
      RWA.safeParse({
        id: validRwaId,
        owned_by: validAccountId,
        quantity: '1',
        held_quantity: '0',
        primary_reference: 'vault://receipts/2',
        status: null,
        is_frozen: false,
        metadata: {},
        parents: [],
        ...replacement,
      }).success
    ).toBe(false);
  });

  it.each([
    ['non-hex hash', `${'0'.repeat(63)}g$commodities.main`],
    ['uppercase hash', `${'FF'.repeat(32)}$commodities.main`],
    ['short hash', `01$commodities.main`],
    ['unqualified domain', `${'ff'.repeat(32)}$commodities`],
    ['noncanonical domain', `${'ff'.repeat(32)}$Commodities.main`],
    ['surrounding whitespace', ` ${validRwaId}`],
  ])('rejects a noncanonical RWA response id with %s', (_case, id) => {
    expect(
      RWA.safeParse({
        id,
        owned_by: validAccountId,
        quantity: '1',
        held_quantity: '0',
        primary_reference: 'vault://receipts/2',
        status: 'active',
        is_frozen: false,
        metadata: {},
        parents: [],
      }).success
    ).toBe(false);
  });

  it('rejects invalid RWA status names and extra parent fields', () => {
    const base = {
      id: validRwaId,
      owned_by: validAccountId,
      quantity: '1',
      held_quantity: '0',
      primary_reference: 'vault://receipts/2',
      is_frozen: false,
      metadata: {},
    };

    expect(RWA.safeParse({ ...base, status: 'in review', parents: [] }).success).toBe(false);
    expect(
      RWA.safeParse({
        ...base,
        status: null,
        parents: [{ rwa: validParentRwaId, quantity: '1', contribution: '1' }],
      }).success
    ).toBe(false);
  });

  it('parses exact domain DTO counts at u32 boundaries', () => {
    const parsed = Domain.parse({
      id: 'gallery.main',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      accounts: 0,
      assets: 0xffff_ffff,
      nfts: 1,
    });

    expect(parsed.id).toBe('gallery.main');
    expect(parsed.assets).toBe(0xffff_ffff);
  });

  it.each([
    ['unqualified id', { id: 'gallery' }],
    ['noncanonical id', { id: 'Gallery.main' }],
    ['whitespace id', { id: ' gallery.main' }],
    ['negative count', { accounts: -1 }],
    ['fractional count', { assets: 1.5 }],
    ['overflow count', { nfts: 0x1_0000_0000 }],
    ['unknown field', { alias: 'gallery' }],
  ])('rejects an inexact domain DTO with %s', (_case, replacement) => {
    expect(
      Domain.safeParse({
        id: 'gallery.main',
        logo: null,
        metadata: {},
        owned_by: validAccountId,
        accounts: 0,
        assets: 0,
        nfts: 0,
        ...replacement,
      }).success
    ).toBe(false);
  });

  it('parses the full asset-definition record and preserves detail-only alias binding data', () => {
    const exactAlias = 'USD#Issuer.Main';
    const parsed = AssetDefinition.parse({
      id: validAssetDefinitionId,
      owning_domain: 'issuer.main',
      alias: exactAlias,
      alias_binding: {
        alias: exactAlias,
        status: 'permanent',
        bound_at_ms: 1_700_000_000_000,
      },
      balance_scope_policy: 'Global',
      confidential_policy: { mode: 'transparent' },
      name: 'USD',
      description: null,
      mintable: 'Limited(42)',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      spec: { scale: 18 },
      total_quantity: '200',
    });

    expect(parsed.mintable).toBe('Limited(42)');
    expect(parsed.owning_domain).toBe('issuer.main');
    expect(parsed.alias).toBe(exactAlias);
    expect(parsed.alias_binding?.alias).toBe(exactAlias);
    expect(parsed.name).toBe('USD');
    expect(parsed.total_quantity.toString()).toBe('200');
    expect('assets' in parsed).toBe(false);
    expect(() => AssetDefinition.parse({ ...parsed, assets: 2 })).toThrow();
  });

  it('parses nullable ownership and alias fields on the full asset-definition route', () => {
    const parsed = AssetDefinition.parse({
      id: validAssetDefinitionId,
      owning_domain: null,
      alias: null,
      balance_scope_policy: 'DataspaceRestricted',
      confidential_policy: { mode: 'transparent' },
      name: 'usd',
      description: null,
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      spec: { scale: 0 },
      total_quantity: '0',
    });

    expect(parsed.owning_domain).toBeNull();
    expect(parsed.alias).toBeNull();
    expect(parsed.alias_binding).toBeUndefined();
    expect(parsed.total_quantity.toString()).toBe('0');
  });

  it('parses the exact current Explorer asset-definition DTO', () => {
    const parsed = ExplorerAssetDefinition.parse({
      id: validAssetDefinitionId,
      owning_domain: 'issuer.main',
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      assets: 2,
      total_quantity: '12',
      locked_quantity: null,
      circulating_quantity: '9',
    });

    expect(parsed.owning_domain).toBe('issuer.main');
    expect(parsed.assets).toBe(2);
    expect(parsed.total_quantity.toString()).toBe('12');
    expect(parsed.locked_quantity).toBeNull();
    expect(parsed.circulating_quantity?.toString()).toBe('9');
  });

  it('rejects retired Explorer presentation fields and noncanonical ownership', () => {
    const payload = {
      id: validAssetDefinitionId,
      owning_domain: 'issuer.main',
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      assets: 0,
      total_quantity: '0',
      locked_quantity: null,
      circulating_quantity: null,
    };

    expect(ExplorerAssetDefinition.parse(payload).owning_domain).toBe('issuer.main');
    expect(ExplorerAssetDefinition.safeParse({ ...payload, owning_domain: 'Issuer.main' }).success).toBe(false);
    expect(ExplorerAssetDefinition.safeParse({ ...payload, name: 'USD' }).success).toBe(false);
    expect(ExplorerAssetDefinition.safeParse({ ...payload, description: null }).success).toBe(false);
    expect(ExplorerAssetDefinition.safeParse({ ...payload, alias: 'USD#Issuer.Main' }).success).toBe(false);
    expect(
      ExplorerAssetDefinition.safeParse({
        ...payload,
        id: `${validAssetDefinitionId.slice(0, -1)}b`,
      }).success
    ).toBe(false);
  });

  it.each([
    'id',
    'owning_domain',
    'mintable',
    'logo',
    'metadata',
    'owned_by',
    'assets',
    'total_quantity',
    'locked_quantity',
    'circulating_quantity',
  ])('rejects an Explorer asset-definition DTO missing required field %s', (field) => {
    const payload: Record<string, unknown> = {
      id: validAssetDefinitionId,
      owning_domain: null,
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      assets: 0,
      total_quantity: '0',
      locked_quantity: null,
      circulating_quantity: null,
    };
    delete payload[field];

    expect(() => ExplorerAssetDefinition.parse(payload)).toThrow();
  });

  it.each(['Limited(1)', 'Limited(4294967295)'])('accepts exact bounded mintability %s', (mintable) => {
    expect(
      ExplorerAssetDefinition.safeParse({
        id: validAssetDefinitionId,
        owning_domain: null,
        mintable,
        logo: null,
        metadata: {},
        owned_by: validAccountId,
        assets: 0,
        total_quantity: '0',
        locked_quantity: null,
        circulating_quantity: null,
      }).success
    ).toBe(true);
  });

  it.each([
    'Limited(0)',
    'Limited(00)',
    'Limited(01)',
    'Limited(-1)',
    'Limited(+1)',
    'Limited(1.5)',
    'Limited()',
    'Limited(junk)',
    'Limited(4294967296)',
    ' limited(1)',
  ])('rejects noncanonical mintability %s', (mintable) => {
    expect(
      ExplorerAssetDefinition.safeParse({
        id: validAssetDefinitionId,
        owning_domain: null,
        mintable,
        logo: null,
        metadata: {},
        owned_by: validAccountId,
        assets: 0,
        total_quantity: '0',
        locked_quantity: null,
        circulating_quantity: null,
      }).success
    ).toBe(false);
  });

  it('parses the exact confidential-asset transition policy including window metadata', () => {
    const parsed = ConfidentialAssetPolicy.parse({
      asset_id: validAssetDefinitionId,
      block_height: 1_050,
      current_mode: 'Convertible',
      effective_mode: 'Convertible',
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: {
        transition_id: 'CD'.repeat(32),
        previous_mode: 'Convertible',
        new_mode: 'ShieldedOnly',
        effective_height: 1_200,
        conversion_window: 200,
        window_open_height: 1_000,
      },
    });

    expect(parsed.asset_id).toBe(validAssetDefinitionId);
    expect(parsed.vk_set_hash).toBe('AB'.repeat(32));
    expect(parsed.pending_transition?.transition_id).toBe('CD'.repeat(32));
    expect(parsed.block_height).toBe('1050');
    expect(parsed.pending_transition?.window_open_height).toBe('1000');
  });

  it('preserves the complete confidential-policy u64 domain as canonical decimal strings', () => {
    const maxU64 = 18_446_744_073_709_551_615n;
    const parsed = ConfidentialAssetPolicy.parse({
      asset_id: validAssetDefinitionId,
      block_height: maxU64,
      current_mode: 'Convertible',
      effective_mode: 'ShieldedOnly',
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: {
        transition_id: 'CD'.repeat(32),
        previous_mode: 'Convertible',
        new_mode: 'ShieldedOnly',
        effective_height: maxU64,
        conversion_window: 1n,
        window_open_height: maxU64 - 1n,
      },
    });

    expect(parsed.block_height).toBe('18446744073709551615');
    expect(parsed.pending_transition?.effective_height).toBe('18446744073709551615');
    expect(parsed.pending_transition?.window_open_height).toBe('18446744073709551614');
  });

  it('accepts the exact no-transition and ShieldedOnly-to-Convertible policy states', () => {
    expect(
      ConfidentialAssetPolicy.safeParse({
        asset_id: validAssetDefinitionId,
        block_height: 10,
        current_mode: 'TransparentOnly',
        effective_mode: 'TransparentOnly',
        vk_set_hash: null,
        poseidon_params_id: null,
        pedersen_params_id: null,
        pending_transition: null,
      }).success
    ).toBe(true);

    expect(
      ConfidentialAssetPolicy.safeParse({
        asset_id: validAssetDefinitionId,
        block_height: 20,
        current_mode: 'ShieldedOnly',
        effective_mode: 'ShieldedOnly',
        vk_set_hash: 'AB'.repeat(32),
        poseidon_params_id: 7,
        pedersen_params_id: 11,
        pending_transition: {
          transition_id: 'CD'.repeat(32),
          previous_mode: 'ShieldedOnly',
          new_mode: 'Convertible',
          effective_height: 30,
          conversion_window: null,
          window_open_height: null,
        },
      }).success
    ).toBe(true);
  });

  it('rejects malformed confidential transition hashes, windows, modes, and effective state', () => {
    const transition = {
      transition_id: 'CD'.repeat(32),
      previous_mode: 'Convertible' as const,
      new_mode: 'ShieldedOnly' as const,
      effective_height: 1_200,
      conversion_window: 200,
      window_open_height: 1_000,
    };
    const payload = {
      asset_id: validAssetDefinitionId,
      block_height: 1_050,
      current_mode: 'Convertible' as const,
      effective_mode: 'Convertible' as const,
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: transition,
    };

    expect(ConfidentialAssetPolicy.safeParse({ ...payload, vk_set_hash: 'ab'.repeat(32) }).success).toBe(false);
    expect(ConfidentialAssetPolicy.safeParse({ ...payload, vk_set_hash: 'AA'.repeat(32) }).success).toBe(false);
    expect(
      ConfidentialAssetPolicy.safeParse({
        ...payload,
        pending_transition: { ...transition, transition_id: 'cd'.repeat(32) },
      }).success
    ).toBe(false);
    expect(
      ConfidentialAssetPolicy.safeParse({
        ...payload,
        pending_transition: { ...transition, transition_id: 'AA'.repeat(32) },
      }).success
    ).toBe(false);
    expect(
      ConfidentialAssetPolicy.safeParse({
        ...payload,
        pending_transition: { ...transition, window_open_height: 999 },
      }).success
    ).toBe(false);
    expect(
      ConfidentialAssetPolicy.safeParse({
        ...payload,
        pending_transition: { ...transition, conversion_window: null, window_open_height: null },
      }).success
    ).toBe(false);
    expect(ConfidentialAssetPolicy.safeParse({ ...payload, current_mode: 'TransparentOnly' }).success).toBe(false);
    expect(
      ConfidentialAssetPolicy.safeParse({ ...payload, block_height: 1_200, effective_mode: 'Convertible' }).success
    ).toBe(false);
  });

  it('rejects retired fields at both confidential transition DTO boundaries', () => {
    const transition = {
      transition_id: 'CD'.repeat(32),
      previous_mode: 'Convertible' as const,
      new_mode: 'ShieldedOnly' as const,
      effective_height: 1_200,
      conversion_window: 200,
      window_open_height: 1_000,
    };
    const payload = {
      asset_id: validAssetDefinitionId,
      block_height: 1_050,
      current_mode: 'Convertible' as const,
      effective_mode: 'Convertible' as const,
      vk_set_hash: 'AB'.repeat(32),
      poseidon_params_id: 7,
      pedersen_params_id: 11,
      pending_transition: transition,
    };

    expect(ConfidentialAssetPolicy.safeParse({ ...payload, definition_id: validAssetDefinitionId }).success).toBe(
      false
    );
    expect(
      ConfidentialAssetPolicy.safeParse({
        ...payload,
        pending_transition: { ...transition, window_start_height: 1_000 },
      }).success
    ).toBe(false);
  });

  it('parses asset-definition econometrics payloads', () => {
    const parsed = AssetDefinitionEconometrics.parse({
      definition_id: validAssetDefinitionId,
      computed_at_ms: 1700000000000,
      velocity_windows: [
        {
          key: '24h',
          start_ms: 1699990000000,
          end_ms: 1700000000000,
          transfers: 3,
          unique_senders: 2,
          unique_receivers: 2,
          amount: '10',
        },
      ],
      issuance_windows: [
        {
          key: '24h',
          start_ms: 1699990000000,
          end_ms: 1700000000000,
          mint_count: 1,
          burn_count: 1,
          minted: '100',
          burned: '5',
          net: '95',
        },
      ],
      issuance_series: [
        { bucket_start_ms: 1699990000000, minted: '0', burned: '0', net: '0' },
        { bucket_start_ms: 1699995000000, minted: '100', burned: '5', net: '95' },
      ],
    });

    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.velocity_windows[0]?.amount.toString()).toBe('10');
    expect(parsed.issuance_windows[0]?.net.toString()).toBe('95');
    expect(parsed.issuance_series[1]?.burned.toString()).toBe('5');
  });

  it('rejects retired fields at every asset-definition econometrics object boundary', () => {
    const velocityWindow = {
      key: '24h',
      start_ms: 1699990000000,
      end_ms: 1700000000000,
      transfers: 3,
      unique_senders: 2,
      unique_receivers: 2,
      amount: '10',
    };
    const issuanceWindow = {
      key: '24h',
      start_ms: 1699990000000,
      end_ms: 1700000000000,
      mint_count: 1,
      burn_count: 1,
      minted: '100',
      burned: '5',
      net: '95',
    };
    const issuancePoint = {
      bucket_start_ms: 1699995000000,
      minted: '100',
      burned: '5',
      net: '95',
    };
    const payload = {
      definition_id: validAssetDefinitionId,
      computed_at_ms: 1700000000000,
      velocity_windows: [velocityWindow],
      issuance_windows: [issuanceWindow],
      issuance_series: [issuancePoint],
    };

    expect(AssetDefinitionEconometrics.safeParse({ ...payload, retired_total_supply: '100' }).success).toBe(false);
    expect(
      AssetDefinitionEconometrics.safeParse({
        ...payload,
        velocity_windows: [{ ...velocityWindow, retired_volume: '10' }],
      }).success
    ).toBe(false);
    expect(
      AssetDefinitionEconometrics.safeParse({
        ...payload,
        issuance_windows: [{ ...issuanceWindow, retired_issued: '100' }],
      }).success
    ).toBe(false);
    expect(
      AssetDefinitionEconometrics.safeParse({
        ...payload,
        issuance_series: [{ ...issuancePoint, retired_supply: '95' }],
      }).success
    ).toBe(false);
  });

  it('parses asset-definition snapshot payloads (distribution + top holders)', () => {
    const payload = {
      definition_id: validAssetDefinitionId,
      computed_at_ms: 1700000000000,
      holders_total: 2,
      total_supply: '200',
      top_holders: [
        { account_id: validAccountId, balance: '100' },
        { account_id: validAccountIdAlt, balance: '100' },
      ],
      distribution: {
        gini: 0,
        hhi: 0.5,
        theil: 0,
        entropy: 0.6931,
        entropy_normalized: 1,
        nakamoto_33: 1,
        nakamoto_51: 2,
        nakamoto_67: 2,
        top1: 0.5,
        top5: 1,
        top10: 1,
        median: '100',
        p90: '100',
        p99: '100',
        lorenz: [
          { population: 0, share: 0 },
          { population: 1, share: 1 },
        ],
      },
    };
    const parsed = AssetDefinitionSnapshot.parse(payload);

    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.total_supply.toString()).toBe('200');
    expect(parsed.top_holders[0]?.balance.toString()).toBe('100');
    expect(parsed.distribution.hhi).toBe(0.5);
    expect(parsed.distribution.median?.toString()).toBe('100');
    expect(parsed.distribution.lorenz).toHaveLength(2);
    expect(parsed.distribution.nakamoto_51).toBe(2);
    for (const field of ['nakamoto_33', 'nakamoto_51', 'nakamoto_67'] as const) {
      const distribution: Partial<typeof payload.distribution> = { ...payload.distribution };
      delete distribution[field];
      expect(AssetDefinitionSnapshot.safeParse({ ...payload, distribution }).success).toBe(false);
    }
  });

  it('rejects retired fields at every asset-definition snapshot object boundary', () => {
    const holder = { account_id: validAccountId, balance: '100' };
    const lorenzPoint = { population: 0, share: 0 };
    const distribution = {
      gini: 0,
      hhi: 1,
      theil: 0,
      entropy: 0,
      entropy_normalized: 0,
      nakamoto_33: 1,
      nakamoto_51: 1,
      nakamoto_67: 1,
      top1: 1,
      top5: 1,
      top10: 1,
      median: '100',
      p90: '100',
      p99: '100',
      lorenz: [lorenzPoint],
    };
    const payload = {
      definition_id: validAssetDefinitionId,
      computed_at_ms: 1700000000000,
      holders_total: 1,
      total_supply: '100',
      top_holders: [holder],
      distribution,
    };

    expect(AssetDefinitionSnapshot.safeParse({ ...payload, retired_owner_count: 1 }).success).toBe(false);
    expect(
      AssetDefinitionSnapshot.safeParse({
        ...payload,
        top_holders: [{ ...holder, retired_share: 1 }],
      }).success
    ).toBe(false);
    expect(
      AssetDefinitionSnapshot.safeParse({
        ...payload,
        distribution: { ...distribution, retired_coefficient: 0 },
      }).success
    ).toBe(false);
    expect(
      AssetDefinitionSnapshot.safeParse({
        ...payload,
        distribution: {
          ...distribution,
          lorenz: [{ ...lorenzPoint, retired_cumulative_share: 0 }],
        },
      }).success
    ).toBe(false);
  });

  it('parses the exact current Explorer asset DTO including a dataspace-scoped id', () => {
    const scopedAssetId = `${validAssetId}#dataspace:7`;
    const parsed = ExplorerAsset.parse({
      id: scopedAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      value: '13',
    });

    expect(parsed.id).toBe(scopedAssetId);
    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.account_id).toBe(validAccountId);
    expect(parsed.value.toString()).toBe('13');
    expect(Object.keys(parsed).sort()).toEqual(['account_id', 'definition_id', 'id', 'value']);
  });

  it('rejects retired asset presentation fields and noncanonical response ids', () => {
    const payload = {
      id: validAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      value: '13',
    };

    expect(ExplorerAsset.parse(payload).definition_id).toBe(validAssetDefinitionId);
    expect(ExplorerAsset.safeParse({ ...payload, id: ` ${validAssetId}` }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, asset_name: 'USD' }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, asset_alias: 'USD#Issuer.Main' }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, definition_id: alternateAssetDefinitionId }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, account_id: validAccountIdAlt }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, account_id: 'sora1' }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, id: `${validAssetId}#dataspace:007` }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, id: `${validAssetId}#dataspace:18446744073709551616` }).success).toBe(
      false
    );
  });

  it('accepts canonical Quantity strings through the full signed 512-bit positive domain', () => {
    const maximum = ((1n << 511n) - 1n).toString();
    const parsed = ExplorerAsset.parse({
      id: validAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      value: maximum,
    });

    expect(parsed.value.toFixed()).toBe(maximum);
    expect(
      RWA.parse({
        id: validRwaId,
        owned_by: validAccountId,
        quantity: '0.0000000000000000000000000001',
        held_quantity: '0',
        primary_reference: 'vault://receipts/3',
        status: null,
        is_frozen: false,
        metadata: {},
        parents: [],
      }).quantity.toFixed()
    ).toBe('0.0000000000000000000000000001');
  });

  it.each([
    { label: 'JSON number', value: 13 },
    { label: 'negative quantity', value: '-1' },
    { label: 'leading zero', value: '01' },
    { label: 'explicit plus sign', value: '+1' },
    { label: 'trailing fractional zero', value: '1.0' },
    { label: 'scale above 28', value: `0.${'0'.repeat(28)}1` },
    { label: 'mantissa above the signed domain', value: (1n << 511n).toString() },
  ])('rejects a noncanonical Explorer Quantity: $label', ({ value }) => {
    expect(() =>
      ExplorerAsset.parse({
        id: validAssetId,
        definition_id: validAssetDefinitionId,
        account_id: validAccountId,
        value,
      })
    ).toThrow();
  });

  it('accepts the signed Numeric minimum for issuance net and rejects values below it', () => {
    const minimum = -(1n << 511n);
    const payload = {
      definition_id: validAssetDefinitionId,
      computed_at_ms: 1_700_000_000_000,
      velocity_windows: [],
      issuance_windows: [],
      issuance_series: [{ bucket_start_ms: 1_699_995_000_000, minted: '0', burned: '0', net: minimum.toString() }],
    };

    expect(AssetDefinitionEconometrics.parse(payload).issuance_series[0]?.net.toFixed()).toBe(minimum.toString());
    expect(() =>
      AssetDefinitionEconometrics.parse({
        ...payload,
        issuance_series: [{ ...payload.issuance_series[0], net: (minimum - 1n).toString() }],
      })
    ).toThrow();
    expect(() =>
      AssetDefinitionEconometrics.parse({
        ...payload,
        issuance_series: [{ ...payload.issuance_series[0], net: '-0' }],
      })
    ).toThrow();
  });

  it('allows metrics snapshots without avg_block_time yet', () => {
    const parsed = NetworkMetrics.parse({
      peers: 4,
      domains: 3,
      accounts: 8,
      assets: 12,
      transactions_accepted: 144,
      transactions_rejected: 2,
      block: 99,
      block_created_at: null,
      finalized_block: 99,
      avg_commit_time: { ms: 260 },
      avg_block_time: null,
    });

    expect(parsed.avg_block_time).toBeNull();
  });

  it('parses nexus dataspaces account summaries with populated rows', () => {
    const parsed = NexusDataspacesAccountSummary.parse({
      account: validAccountId,
      account_id: validAccountId,
      uaid: 'uaid:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      totals: {
        dataspaces: 1,
        accounts_bound: 2,
        portfolio_accounts: 1,
        portfolio_positions: 3,
        manifests_total: 1,
        manifests_active: 1,
        consensus_entries: 2,
        consensus_tx_count: 7,
        consensus_chunks_total: 14,
        consensus_rbc_bytes_total: 1400,
        consensus_teu_total: 700,
      },
      dataspaces: [
        {
          dataspace_id: 42,
          dataspace_alias: 'finance',
          accounts: [validAccountId, validAccountIdAlt],
          portfolio: {
            accounts: 1,
            positions: 3,
            asset_definitions: 2,
          },
          manifest: {
            present: true,
            status: 'Active',
            active: true,
            issued_ms: 1700000000000,
            activation_epoch: 100,
            expiry_epoch: null,
            activated_epoch: 101,
            expired_epoch: null,
            revoked_epoch: null,
            revoked_reason: null,
            entries: 4,
          },
          consensus: {
            entries: 2,
            lane_ids: [0, 7],
            tx_count: 7,
            total_chunks: 14,
            rbc_bytes_total: 1400,
            teu_total: 700,
            last_block_height: 123,
            last_block_hash: '0xabc',
            details: [
              {
                block_height: 123,
                lane_id: 7,
                dataspace_id: 42,
                tx_count: 5,
                total_chunks: 10,
                rbc_bytes_total: 1000,
                teu_total: 500,
                block_hash: '0xabc',
              },
            ],
          },
        },
      ],
    });

    expect(parsed.uaid).toMatch(/^uaid:/);
    expect(parsed.totals.dataspaces).toBe(1);
    expect(parsed.dataspaces[0]?.manifest.status).toBe('Active');
    expect(parsed.dataspaces[0]?.consensus.details[0]?.lane_id).toBe(7);
    expect(() =>
      NexusDataspacesAccountSummary.parse({
        ...parsed,
        retired_status_projection: true,
      })
    ).toThrow();
    expect(() =>
      NexusDataspacesAccountSummary.parse({
        ...parsed,
        dataspaces: [{ ...parsed.dataspaces[0], retired_lane_summary: true }],
      })
    ).toThrow();
    expect(() =>
      NexusDataspacesAccountSummary.parse({
        ...parsed,
        totals: { ...parsed.totals, consensus_entries: -1 },
      })
    ).toThrow();
  });

  it('parses nexus dataspaces account summaries without uaid bindings', () => {
    const parsed = NexusDataspacesAccountSummary.parse({
      account: validAccountId,
      account_id: validAccountId,
      uaid: null,
      totals: {
        dataspaces: 0,
        accounts_bound: 0,
        portfolio_accounts: 0,
        portfolio_positions: 0,
        manifests_total: 0,
        manifests_active: 0,
        consensus_entries: 0,
        consensus_tx_count: 0,
        consensus_chunks_total: 0,
        consensus_rbc_bytes_total: 0,
        consensus_teu_total: 0,
      },
      dataspaces: [],
    });

    expect(parsed.uaid).toBeNull();
    expect(parsed.dataspaces).toHaveLength(0);
  });

  it('accepts transaction rejection reasons with authoritative Norito JSON evidence', () => {
    const parsed = DetailedTransaction.parse({
      authority: validAccountId,
      hash: 'c1'.repeat(32),
      block: 1,
      created_at: '2024-01-01T00:00:00Z',
      executable: 'Instructions',
      status: 'Rejected',
      executable_payload: { instruction_count: 1 },
      rejection_reason: {
        encoded: '0x01',
        json: rejectionJson,
        message: 'Validation failed: Account permission denied',
      },
      metadata: {},
      nonce: null,
      signature: 'ed0120deadbeef',
      time_to_live: null,
    });

    expect(parsed.rejection_reason?.json).toEqual(rejectionJson);
    expect(parsed.rejection_reason?.message).toBe('Validation failed: Account permission denied');
  });

  it('rejects transaction rejection reasons that use scale instead of encoded', () => {
    expect(() =>
      DetailedTransaction.parse({
        authority: validAccountId,
        hash: 'c1'.repeat(32),
        block: 1,
        created_at: '2024-01-01T00:00:00Z',
        executable: 'Instructions',
        status: 'Rejected',
        executable_payload: { instruction_count: 1 },
        rejection_reason: {
          scale: '0x01',
          json: rejectionJson,
          message: 'Validation failed: Account permission denied',
        },
        metadata: {},
        nonce: null,
        signature: 'ed0120deadbeef',
        time_to_live: null,
      })
    ).toThrow();
  });

  it.each(['encoded', 'json', 'message'] as const)('rejects a rejection reason missing current field %s', (field) => {
    const rejectionReason: Partial<Record<'encoded' | 'json' | 'message', unknown>> = {
      encoded: '0x01',
      json: rejectionJson,
      message: 'Validation failed: Account permission denied',
    };
    delete rejectionReason[field];

    expect(
      DetailedTransaction.safeParse({
        authority: validAccountId,
        hash: 'c1'.repeat(32),
        block: 1,
        created_at: '2024-01-01T00:00:00Z',
        executable: 'Instructions',
        status: 'Rejected',
        executable_payload: { instruction_count: 1 },
        rejection_reason: rejectionReason,
        metadata: {},
        nonce: null,
        signature: 'ed0120deadbeef',
        time_to_live: null,
      }).success
    ).toBe(false);
  });

  it.each([
    ['empty encoded evidence', 'encoded', '0x'],
    ['unprefixed encoded evidence', 'encoded', '01'],
    ['uppercase encoded evidence', 'encoded', '0xAB'],
    ['empty authoritative message', 'message', ''],
    ['whitespace authoritative message', 'message', '   '],
  ] as const)('rejects rejection reasons with %s', (_case, field, value) => {
    const rejectionReason = {
      encoded: '0x01',
      json: rejectionJson,
      message: 'Validation failed: Account permission denied',
      [field]: value,
    };

    expect(
      DetailedTransaction.safeParse({
        authority: validAccountId,
        hash: 'c1'.repeat(32),
        block: 1,
        created_at: '2024-01-01T00:00:00Z',
        executable: 'Instructions',
        status: 'Rejected',
        executable_payload: { instruction_count: 1 },
        rejection_reason: rejectionReason,
        metadata: {},
        nonce: null,
        signature: 'ed0120deadbeef',
        time_to_live: null,
      }).success
    ).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['bigint', 1n],
    ['date object', new Date('2026-01-01T00:00:00Z')],
  ])('rejects non-JSON rejection evidence: %s', (_case, json) => {
    expect(
      DetailedTransaction.safeParse({
        authority: validAccountId,
        hash: 'c2'.repeat(32),
        block: 2,
        created_at: '2024-01-01T00:01:00Z',
        executable: 'Instructions',
        status: 'Rejected',
        executable_payload: { instruction_count: 1 },
        rejection_reason: {
          encoded: '0x02',
          message: 'bad signature',
          json,
        },
        metadata: {},
        nonce: 1,
        signature: 'ed0120cafebabe',
        time_to_live: { ms: 1000 },
      }).success
    ).toBe(false);
  });

  it('parses current proof-registry rows and every bridge payload family without aliases', () => {
    const base = {
      backend: 'halo2/ipa',
      hash: 'ab'.repeat(32),
      status: 'Verified' as const,
      verified_at_height: 42,
      vk_ref: { backend: 'halo2/ipa', name: 'transfer-v1' },
      vk_commitment: 'cd'.repeat(32),
    };
    const payloads = [
      {
        kind: 'ics' as const,
        state_root: '01'.repeat(32),
        leaf_hash: '02'.repeat(32),
        hash_function: 'Sha256' as const,
        path_len: 8,
      },
      { kind: 'transparent_zk' as const, backend: 'halo2/ipa', proof_len_bytes: 512, recursion_depth: 2 },
      { kind: 'native_protocol' as const, backend: 'fastpq', proof_len_bytes: 256 },
      {
        kind: 'sccp_destination' as const,
        backend: 'groth16/bls12-381',
        artifact_len_bytes: 1024,
        message_id: '03'.repeat(32),
        request_hash: '04'.repeat(32),
        destination_binding_hash: '05'.repeat(32),
      },
    ];

    for (const payload of payloads) {
      const parsed = ZkProofRegistryItem.parse({
        ...base,
        bridge: {
          binding: { kind: 'verifier_manifest', hash: '06'.repeat(32) },
          commitment: '07'.repeat(32),
          size_bytes: 2048,
          range: { start_height: 10, end_height: 20 },
          payload,
        },
      });
      expect(parsed.bridge?.payload.kind).toBe(payload.kind);
    }
  });

  it('rejects legacy proof fields, non-canonical hashes, and unknown bridge payloads', () => {
    const current = {
      backend: 'halo2/ipa',
      proof_hash: 'ab'.repeat(32),
      status: 'Submitted',
      vk_ref: null,
      vk_commitment: null,
    };

    expect(() => ZkProofDetail.parse({ ...current, id: 'legacy-report-id' })).toThrow();
    expect(() => ZkProofDetail.parse({ ...current, proof_hash: 'AB'.repeat(32) })).toThrow();
    expect(() =>
      ZkProofDetail.parse({
        ...current,
        bridge: {
          binding: { kind: 'verifier_manifest', hash: '01'.repeat(32) },
          commitment: '02'.repeat(32),
          size_bytes: 1,
          range: { start_height: 1, end_height: 2 },
          payload: { kind: 'legacy_proof', proof_len_bytes: 1 },
        },
      })
    ).toThrow();
  });

  it('enforces current proof identities and ordered bridge height ranges', () => {
    expect(ZkProofId.parse({ backend: 'stark/fri/poseidon-x7-goldilocks-6x64-v1', hash: '01'.repeat(32) })).toEqual({
      backend: 'stark/fri/poseidon-x7-goldilocks-6x64-v1',
      hash: '01'.repeat(32),
    });

    expect(() => ZkProofId.parse({ backend: '', hash: '01'.repeat(32) })).toThrow();

    expect(() =>
      ZkProofRegistryItem.parse({
        backend: 'halo2/ipa',
        hash: 'ab'.repeat(32),
        status: 'Verified',
        verified_at_height: 20,
        vk_ref: null,
        vk_commitment: null,
        bridge: {
          binding: { kind: 'verifier_manifest', hash: '01'.repeat(32) },
          commitment: '02'.repeat(32),
          size_bytes: 1,
          range: { start_height: 20, end_height: 19 },
          payload: { kind: 'native_protocol', backend: 'halo2/ipa', proof_len_bytes: 1 },
        },
      })
    ).toThrow(/end_height/u);
  });

  it('parses an exact verifying-key detail including its canonical Norito archive', () => {
    const parsed = ZkVerifyingKeyDetail.parse({
      id: { backend: 'halo2/ipa', name: 'transfer-v1' },
      record: {
        version: 1,
        circuit_id: 'transfer',
        owner_manifest_id: null,
        namespace: 'core',
        backend: 'Halo2Ipa',
        curve: 'pallas',
        public_inputs_schema_hash: '11'.repeat(32),
        commitment: '22'.repeat(32),
        vk_len: 128,
        max_proof_bytes: 4096,
        gas_schedule_id: 'default',
        metadata_uri_cid: null,
        vk_bytes_cid: 'bafy-vk',
        activation_height: 10,
        withdraw_height: null,
        status: 'Active',
        key: { backend: 'halo2/ipa', bytes_b64: 'AQIDBA==' },
      },
      record_norito_base64: 'Tk9SSVRP',
    });

    expect(parsed.record.status).toBe('Active');
    expect(parsed.record_norito_base64).toBe('Tk9SSVRP');
  });

  it('rejects non-portable verifying-key ids, invalid lifecycle ranges, and non-base64 Norito records', () => {
    const current = {
      id: { backend: 'halo2/ipa', name: 'transfer-v1' },
      record: {
        version: 1,
        circuit_id: 'transfer',
        owner_manifest_id: null,
        namespace: 'core',
        backend: 'Halo2Ipa',
        curve: 'pallas',
        public_inputs_schema_hash: '11'.repeat(32),
        commitment: '22'.repeat(32),
        vk_len: 128,
        max_proof_bytes: 4096,
        gas_schedule_id: 'default',
        metadata_uri_cid: null,
        vk_bytes_cid: null,
        activation_height: 20,
        withdraw_height: 10,
        status: 'Withdrawn',
        key: null,
      },
      record_norito_base64: 'Tk9SSVRP',
    };

    expect(() => ZkVerifyingKeyDetail.parse(current)).toThrow(/withdraw_height/u);
    expect(() =>
      ZkVerifyingKeyDetail.parse({
        ...current,
        record: { ...current.record, withdraw_height: 20 },
      })
    ).toThrow(/greater than activation_height/u);
    expect(
      ZkVerifyingKeyDetail.parse({
        ...current,
        record: { ...current.record, withdraw_height: 21 },
      }).record.withdraw_height
    ).toBe(21);
    expect(() =>
      ZkVerifyingKeyDetail.parse({
        ...current,
        id: { backend: 'halo2/ipa', name: 'VkTransfer' },
        record: { ...current.record, withdraw_height: 21 },
      })
    ).toThrow();
    expect(() =>
      ZkVerifyingKeyDetail.parse({
        ...current,
        record: { ...current.record, withdraw_height: 21 },
        record_norito_base64: 'not base64!',
      })
    ).toThrow(/base64/u);
  });

  it('parses the exact current system-parameter snapshot including custom payloads', () => {
    const parsed = SystemParameters.parse(validSystemParameters);

    expect(parsed.sumeragi.key_allowed_algorithms).toEqual(['ed25519', 'ml-dsa']);
    expect(parsed.transaction.require_sequence).toBe(true);
    expect(parsed.custom?.feature_gate?.payload).toEqual({ enabled: true });
  });

  it.each([
    { ...validSystemParameters, retired_parameter: true },
    { ...validSystemParameters, block: { max_transactions: 0 } },
    {
      ...validSystemParameters,
      transaction: { ...validSystemParameters.transaction, max_metadata_depth: 65536 },
    },
    {
      ...validSystemParameters,
      custom: { feature_gate: { id: 'different_id', payload: { enabled: true } } },
    },
  ])('rejects an inexact system-parameter snapshot %#', (payload) => {
    expect(SystemParameters.safeParse(payload).success).toBe(false);
  });

  const soracleFeedConfig = {
    feed_id: ['price_xor_usd'],
    feed_config_version: [1],
    providers: [validAccountId, validAccountIdAlt],
    connector_id: 'http-bin',
    connector_version: 2,
    cadence_slots: 5,
    aggregation: { aggregation_rule: 'MedianMad', value: 300 },
    outlier_policy: { outlier_policy: 'Mad', value: 350 },
    min_signers: 2,
    committee_size: 2,
    risk_class: { risk_class: 'Medium', value: null },
    max_observers: 4,
    max_value_len: 128,
    max_error_rate_bps: 250,
    dispute_window_slots: 10,
    replay_window_slots: 4,
  } as const;
  const soracleHash = `hash:${'AB'.repeat(32)}#B99E`;

  it('parses exact Soracles feed fixtures with tuple newtypes and tagged policies', () => {
    const median = SoracleFeedConfig.parse(soracleFeedConfig);
    const percentile = SoracleFeedConfig.parse({
      ...soracleFeedConfig,
      aggregation: { aggregation_rule: 'Percentile', value: 5000 },
      outlier_policy: { outlier_policy: 'Absolute', value: { max_delta: '0' } },
      risk_class: { risk_class: 'High', value: null },
    });

    expect(median.feed_id).toEqual(['price_xor_usd']);
    expect(median.cadence_slots).toBe('5');
    expect(percentile.outlier_policy).toEqual({ outlier_policy: 'Absolute', value: { max_delta: '0' } });
  });

  it.each([
    { ...soracleFeedConfig, feed_id: 'price_xor_usd' },
    { ...soracleFeedConfig, feed_config_version: 1 },
    { ...soracleFeedConfig, cadence_slots: 0 },
    { ...soracleFeedConfig, providers: [] },
    { ...soracleFeedConfig, providers: [validAccountId, validAccountId] },
    { ...soracleFeedConfig, min_signers: 0 },
    { ...soracleFeedConfig, committee_size: 0 },
    { ...soracleFeedConfig, max_observers: 1 },
    { ...soracleFeedConfig, committee_size: 3 },
    { ...soracleFeedConfig, min_signers: 3 },
    { ...soracleFeedConfig, max_error_rate_bps: 10_001 },
    { ...soracleFeedConfig, legacy_quorum: 2 },
    {
      ...soracleFeedConfig,
      outlier_policy: { outlier_policy: 'Absolute', value: { max_delta: '01' } },
    },
  ])('rejects a non-Norito or retired Soracles feed shape %#', (payload) => {
    expect(SoracleFeedConfig.safeParse(payload).success).toBe(false);
  });

  it('keeps the signed feed connector String domain exact without invented trim or non-empty constraints', () => {
    expect(SoracleFeedConfig.parse({ ...soracleFeedConfig, connector_id: '' }).connector_id).toBe('');
    expect(SoracleFeedConfig.parse({ ...soracleFeedConfig, connector_id: ' connector ' }).connector_id).toBe(
      ' connector '
    );
  });

  it('rejects duplicate feed identities that the signed keyed registry cannot emit', () => {
    expect(SoracleFeedRegistry.safeParse([soracleFeedConfig, soracleFeedConfig]).success).toBe(false);
    expect(
      SoracleFeedRegistry.safeParse([soracleFeedConfig, { ...soracleFeedConfig, feed_id: ['other_feed'] }]).success
    ).toBe(true);
  });

  it('parses every current Soracles feed-event outcome and preserves i128 mantissas', () => {
    const event = {
      feed_id: ['price_xor_usd'],
      feed_config_version: [1],
      slot: 10,
      request_hash: soracleHash,
      outcome: {
        result: 'Success',
        detail: {
          value: { mantissa: '170052220750163104028821061988450963712', scale: 5 },
          entries: [
            {
              oracle_id: validAccountId,
              observation_hash: soracleHash,
              value: { mantissa: '1002000', scale: 5 },
              outlier: false,
            },
          ],
        },
      },
    } as const;

    expect(SoracleFeedEvent.parse(event).outcome.result).toBe('Success');
    expect(SoracleFeedEvent.parse(event).slot).toBe('10');
    expect(
      SoracleFeedEvent.parse({
        ...event,
        outcome: {
          result: 'Error',
          detail: { code: { error_code: 'Other', value: 42 } },
        },
      }).outcome.result
    ).toBe('Error');
    expect(SoracleFeedEvent.parse({ ...event, outcome: { result: 'Missing', detail: null } }).outcome.result).toBe(
      'Missing'
    );
  });

  it.each([
    { result: 'Missing' },
    { result: 'Missing', detail: {} },
    { result: 'Error', detail: { code: { error_code: 'Timeout', value: 0 } } },
    { result: 'Success', detail: { value: { mantissa: '+1', scale: 0 }, entries: [] } },
  ])('rejects an inexact Soracles feed-event outcome %#', (outcome) => {
    expect(
      SoracleFeedEvent.safeParse({
        feed_id: ['price_xor_usd'],
        feed_config_version: [1],
        slot: 10,
        request_hash: soracleHash,
        outcome,
      }).success
    ).toBe(false);
  });

  it.each([
    {
      entries: [
        {
          oracle_id: validAccountId,
          observation_hash: soracleHash,
          value: { mantissa: '1', scale: 2 },
          outlier: false,
        },
        {
          oracle_id: validAccountId,
          observation_hash: soracleHash,
          value: { mantissa: '2', scale: 2 },
          outlier: false,
        },
      ],
    },
    {
      entries: [
        {
          oracle_id: validAccountId,
          observation_hash: soracleHash,
          value: { mantissa: '1', scale: 3 },
          outlier: false,
        },
      ],
    },
    {
      entries: [
        { oracle_id: validAccountId, observation_hash: soracleHash, value: { mantissa: '1', scale: 2 }, outlier: true },
        {
          oracle_id: validAccountIdAlt,
          observation_hash: soracleHash,
          value: { mantissa: '2', scale: 2 },
          outlier: true,
        },
      ],
    },
  ])('rejects impossible successful Soracles entry sets %#', ({ entries }) => {
    expect(
      SoracleFeedEvent.safeParse({
        feed_id: ['price_xor_usd'],
        feed_config_version: [1],
        slot: 10,
        request_hash: soracleHash,
        outcome: {
          result: 'Success',
          detail: { value: { mantissa: '2', scale: 2 }, entries },
        },
      }).success
    ).toBe(false);
  });

  it("rejects Soracles hashes with a bad checksum or without Iroha's marker bit", () => {
    const event = {
      feed_id: ['price_xor_usd'],
      feed_config_version: [1],
      slot: 10,
      outcome: { result: 'Missing', detail: null },
    };
    expect(SoracleFeedEvent.safeParse({ ...event, request_hash: `hash:${'AB'.repeat(32)}#0000` }).success).toBe(false);
    expect(SoracleFeedEvent.safeParse({ ...event, request_hash: `hash:${'AA'.repeat(32)}#0E5B` }).success).toBe(false);
  });

  it('parses the retained history record envelope and preserves its full-width timestamp', () => {
    const record = SoracleFeedEventRecord.parse({
      event: {
        feed_id: ['price_xor_usd'],
        feed_config_version: [1],
        slot: 18_446_744_073_709_551_615n,
        request_hash: soracleHash,
        outcome: { result: 'Missing', detail: null },
      },
      recorded_at_ms: 18_446_744_073_709_551_615n,
      evidence_hashes: [soracleHash],
    });

    expect(record.event.slot).toBe('18446744073709551615');
    expect(record.recorded_at_ms).toBe('18446744073709551615');
    expect(SoracleFeedEventRecord.safeParse({ ...record, recorded_at_ms: '18446744073709551615' }).success).toBe(false);
  });

  it('parses exact latest DeFi attestation queries and responses', () => {
    expect(DefiOracleAttestationLatestParamsSchema.parse({ domain: 4, subject_id: '0', status: 7 })).toEqual({
      domain: 4,
      subject_id: '0',
      status: 7,
    });
    const attestationHash = deriveDefiOracleAttestationHash({
      domain: 4,
      subjectId: '99',
      oracleSlot: '12',
      statusFlags: 7,
      sourceEvents: [{ feedId: 'price_xor_usd', slot: '10', requestHash: soracleHash, field: 'observed_price' }],
    });
    const oraclePayload = compactJsonBytes(
      `{"domain":4,"policy_id":99,"observed_price":25,"oracle_slot":12,"status_flags":7,"attestation_hash":${attestationHash}}`
    );
    const attestation = DefiOracleAttestation.parse({
      key: { domain: 4, subject_id: 99 },
      provider: validOracleProvider,
      oracle_slot: 12,
      status_flags: 7,
      attestation_hash: BigInt(attestationHash),
      oracle_payload: oraclePayload,
      oracle_signature: signOraclePayload(oraclePayload),
      signer_public_key: validOracleSignerPublicKey,
      oracle_scheme: 1,
      source_events: [{ feed_id: ['price_xor_usd'], slot: 10, request_hash: soracleHash, field: 'observed_price' }],
    });

    expect(attestation.key).toEqual({ domain: 4, subject_id: '99' });
    expect(attestation.oracle_slot).toBe('12');
    expect(attestation.source_events[0]?.field).toBe('observed_price');
  });

  it('preserves maximum u64 attestation identities and admits unrelated generic JSON numbers', () => {
    const max = 18_446_744_073_709_551_615n;
    const oraclePayload = compactJsonBytes(
      '{"domain":4,"policy_id":18446744073709551615,"observed_price":1,"oracle_slot":18446744073709551615,"status_flags":0,"attestation_hash":18446744073709551615,"ratio":1.5}'
    );
    const parsed = DefiOracleAttestation.parse({
      key: { domain: 4, subject_id: max },
      provider: validOracleProvider,
      oracle_slot: max,
      status_flags: 0,
      attestation_hash: max,
      oracle_payload: oraclePayload,
      oracle_signature: signOraclePayload(oraclePayload),
      signer_public_key: validOracleSignerPublicKey,
      oracle_scheme: 1,
      source_events: [],
    });

    expect(parsed.key.subject_id).toBe('18446744073709551615');
    expect(parsed.attestation_hash).toBe('18446744073709551615');
  });

  it.each([
    { domain: 0, subject_id: '1' },
    { domain: 5, subject_id: '1' },
    { domain: 1, subject_id: 1 },
    { domain: 1, subject_id: '01' },
    { domain: 1, subject_id: '18446744073709551616' },
    { domain: 1, subject_id: '1', status: -1 },
    { domain: 1, subject_id: '1', retired: true },
  ])('rejects an unsupported latest DeFi attestation query %#', (query) => {
    expect(DefiOracleAttestationLatestParamsSchema.safeParse(query).success).toBe(false);
  });

  it.each([
    { oracle_payload: [-1] },
    { oracle_payload: [256] },
    { oracle_payload: [] },
    {
      oracle_payload: compactJsonBytes(
        '{"domain":1,"market_id":1,"mark_price_bps":1,"index_price_bps":1,"confidence_bps":1,"oracle_slot":12,"status_flags":-0,"attestation_hash":1}'
      ),
    },
    { attestation_hash: 0 },
    { oracle_scheme: -1 },
    { oracle_scheme: 2 },
    { oracle_signature: Array(63).fill(1) },
    { oracle_signature: Array(64).fill(0) },
    { signer_public_key: Array(31).fill(1) },
    { signer_public_key: Array(32).fill(0) },
    { signer_public_key: validOracleSignerPublicKeyAlt },
    { provider: validMultisigProvider },
    { source_events: [{ feed_id: ['price_xor_usd'], slot: 10, request_hash: soracleHash, field: '' }] },
    { source_events: [{ feed_id: ['price_xor_usd'], slot: 10, request_hash: soracleHash, field: 'missing' }] },
    { retired_payload_hex: '00' },
  ])('rejects malformed or retired DeFi attestation response fields %#', (override) => {
    const oraclePayload = compactJsonBytes(
      '{"domain":1,"market_id":1,"mark_price_bps":1,"index_price_bps":1,"confidence_bps":1,"oracle_slot":12,"status_flags":0,"attestation_hash":1}'
    );
    expect(
      DefiOracleAttestation.safeParse({
        key: { domain: 1, subject_id: 1 },
        provider: validOracleProvider,
        oracle_slot: 12,
        status_flags: 0,
        attestation_hash: 1,
        oracle_payload: oraclePayload,
        oracle_signature: signOraclePayload(oraclePayload),
        signer_public_key: validOracleSignerPublicKey,
        oracle_scheme: 1,
        source_events: [],
        ...override,
      }).success
    ).toBe(false);
  });

  it('rejects a forged signature and a signed payload tampered after signing', () => {
    const oraclePayload = compactJsonBytes(
      '{"domain":1,"market_id":1,"mark_price_bps":1,"index_price_bps":1,"confidence_bps":1,"oracle_slot":12,"status_flags":0,"attestation_hash":1}'
    );
    const valid = {
      key: { domain: 1, subject_id: 1 },
      provider: validOracleProvider,
      oracle_slot: 12,
      status_flags: 0,
      attestation_hash: 1,
      oracle_payload: oraclePayload,
      oracle_signature: signOraclePayload(oraclePayload),
      signer_public_key: validOracleSignerPublicKey,
      oracle_scheme: 1,
      source_events: [],
    } as const;
    const forgedSignature = [...valid.oracle_signature];
    forgedSignature[0] = forgedSignature[0]! ^ 1;
    const tamperedPayload = compactJsonBytes(
      '{"domain":1,"market_id":1,"mark_price_bps":2,"index_price_bps":1,"confidence_bps":1,"oracle_slot":12,"status_flags":0,"attestation_hash":1}'
    );

    expect(DefiOracleAttestation.safeParse(valid).success).toBe(true);
    expect(DefiOracleAttestation.safeParse({ ...valid, oracle_signature: forgedSignature }).success).toBe(false);
    expect(DefiOracleAttestation.safeParse({ ...valid, oracle_payload: tamperedPayload }).success).toBe(false);
  });

  it('rejects a source-backed attestation with a self-consistent but nondeterministic hash', () => {
    const oraclePayload = compactJsonBytes(
      '{"domain":4,"policy_id":99,"observed_price":25,"oracle_slot":12,"status_flags":7,"attestation_hash":1}'
    );

    expect(
      DefiOracleAttestation.safeParse({
        key: { domain: 4, subject_id: 99 },
        provider: validOracleProvider,
        oracle_slot: 12,
        status_flags: 7,
        attestation_hash: 1,
        oracle_payload: oraclePayload,
        oracle_signature: signOraclePayload(oraclePayload),
        signer_public_key: validOracleSignerPublicKey,
        oracle_scheme: 1,
        source_events: [{ feed_id: ['price_xor_usd'], slot: 10, request_hash: soracleHash, field: 'observed_price' }],
      }).success
    ).toBe(false);
  });
});
