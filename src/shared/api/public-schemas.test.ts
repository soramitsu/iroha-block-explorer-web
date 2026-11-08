import { deriveDefiOracleAttestationHash } from '@/shared/lib/soracle-attestation-hash';
import { publicKeyFromPrivate, signEd25519 } from '@iroha/iroha-js/crypto';
import { describe, expect, it } from 'vitest';
import {
  ConfidentialAssetPolicy,
  DefiOracleAttestation,
  DefiOracleAttestationLatestParamsSchema,
  SoracleFeedConfig,
  SoracleFeedEvent,
  SorafsPinManifestResponse,
  SorafsPinRegistryResponse,
  SystemParameters,
  VpnProfile,
  ZkProofDetail,
  ZkProofId,
  ZkProofRegistryItem,
  ZkVerifyingKeyDetail,
} from './schemas';

const validAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const validAccountIdAlt = 'sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D';
const validAssetDefinitionId = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const validOraclePrivateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const validOracleSignerPublicKey = Array.from(publicKeyFromPrivate(validOraclePrivateKey));
const validOracleProvider = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const validOracleSignerPublicKeyAlt = Array.from({ length: 32 }, () => 42);
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
describe('Explorer payload schemas', () => {
  it('fails closed when a VPN relay key requires the unavailable native address validator', () => {
    const parsed = VpnProfile.safeParse({
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

    expect(parsed.success).toBe(false);
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

  it('validates attestation queries but fails closed without native provider binding', () => {
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
    const attestation = DefiOracleAttestation.safeParse({
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

    expect(attestation.success).toBe(false);
  });

  it('rejects unverified maximum-u64 attestations without native provider binding', () => {
    const max = 18_446_744_073_709_551_615n;
    const oraclePayload = compactJsonBytes(
      '{"domain":4,"policy_id":18446744073709551615,"observed_price":1,"oracle_slot":18446744073709551615,"status_flags":0,"attestation_hash":18446744073709551615,"ratio":1.5}'
    );
    const parsed = DefiOracleAttestation.safeParse({
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

    expect(parsed.success).toBe(false);
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
