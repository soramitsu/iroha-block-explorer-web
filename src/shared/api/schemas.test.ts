import stateFinality from '../../../tests/fixtures/taira-state-finality.json';
import { describe, expect, it } from 'vitest';
import {
  Account,
  AccountHistoryResponse,
  AccountPermissionsResponse,
  Asset,
  ExplorerAsset,
  AssetDefinition,
  ExplorerAssetDefinition,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  ContractCodeView,
  ContractVerifiedSourceJobResponse,
  DetailedTransaction,
  Domain,
  ExplorerHealth,
  GovernanceProposalResponse,
  Instruction,
  LatestInstructionsResponse,
  LatestTransactionsResponse,
  StateFinalityResponse,
  MinistryAgendaProposalDraftRequest,
  MinistryAgendaProposalDraftResponse,
  MinistryAgendaProposalGetResponse,
  MinistryAgendaProposalRecord,
  MultisigProposalsQueryResponse,
  MultisigSpecResponse,
  NetworkMetrics,
  NFT,
  CollectionPage,
  PeerMetrics,
  PipelineTransactionStatusResponse,
  RWA,
  NexusDataspacesAccountSummary,
  SoracloudAgentAutonomyStatusResponse,
  SoracloudAgentMailboxStatusResponse,
  SoracloudAgentStatusResponse,
  SoracloudHfSharedLeaseStatusResponse,
  SoracloudModelArtifactStatusResponse,
  SoracloudModelHostStatusResponse,
  SoracloudModelWeightStatusResponse,
  SoracloudPrivateInferenceStatusResponse,
  SoracloudServiceConfigStatusResponse,
  SoracloudServiceSecretStatusResponse,
  SoracloudStatus,
  SoracloudTrainingJobStatusResponse,
  SoracloudUploadedModelStatusResponse,
  SorafsCidLookupResponse,
  SumeragiStatus,
  TransactionSubmissionReceiptResponse,
  Transaction,
} from './schemas';

const validAccountId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const validAccountIdAlt = 'sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D';
const validAccountIdModern = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const validAssetDefinitionId = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const alternateAssetDefinitionId = '62Fk4FPcMuLvW5QjDGNF2a4jAmjM';
const validAssetDefinitionAlias = 'usd#issuer.main';
const validAssetId = `${validAssetDefinitionId}#${validAccountId}`;
const validRwaId = `${'00'.repeat(32)}$commodities.main`;
const validParentRwaId = `${'ff'.repeat(32)}$commodities.main`;
const validFramedInstructionSha256 = '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43';

const baseInstruction = {
  authority: validAccountId,
  created_at: '2024-01-01T00:00:00Z',
  index: 0,
  transaction_hash: '0xabc',
  transaction_status: 'Committed' as const,
  block: 1,
};

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

  it('preserves structured Norito payloads with wire metadata', () => {
    const parsed = Instruction.parse({
      ...baseInstruction,
      kind: 'Transfer',
      box: {
        encoded: '0x02',
        framed_sha256: validFramedInstructionSha256,
        json: {
          kind: 'Transfer',
          payload: { object: validAssetId, source: validAccountId, destination: validAccountIdAlt },
          wire_id: 'iroha.transferAsset',
          encoded: '0xdeadbeef',
        },
      },
    });

    expect(parsed.box.json.kind).toBe('Transfer');
    expect(parsed.box.framed_sha256).toBe(validFramedInstructionSha256);
    expect(parsed.box.json.payload).toEqual({
      object: validAssetId,
      source: validAccountId,
      destination: validAccountIdAlt,
    });
    expect(parsed.box.json.wire_id).toBe('iroha.transferAsset');
    expect(parsed.box.json.encoded).toBe('0xdeadbeef');
  });

  it('rejects missing or malformed canonical framed-instruction digests', () => {
    const instruction = {
      ...baseInstruction,
      kind: 'Transfer',
      box: {
        encoded: '0x02',
        json: {
          kind: 'Transfer',
          payload: { object: validAssetId, source: validAccountId, destination: validAccountIdAlt },
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

  it('accepts instruction payloads that use r#box instead of box', () => {
    const parsed = Instruction.parse({
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
    });

    expect(parsed.box.encoded).toBe('0x03');
    expect(parsed.box.json.kind).toBe('Log');
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
            payload: { object: validAssetId, source: validAccountId, destination: validAccountIdAlt },
            wire_id: 'iroha_data_model::isi::transfer::TransferBox',
          },
        },
      })
    ).toThrow();
  });

  it('accepts concrete ISI names in top-level kind while keeping structured box kind', () => {
    const parsed = Instruction.parse({
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
              encoded: '0x05',
            },
          },
          wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
        },
      },
    });

    expect(parsed.kind).toBe('SubmitOfflineToOnlineTransfer');
    expect(parsed.box.json.kind).toBe('Custom');
    expect(parsed.box.json.payload).toEqual({
      variant: 'SubmitOfflineToOnlineTransfer',
      value: {
        wire_id: 'iroha_data_model::isi::offline::SubmitOfflineToOnlineTransfer',
        encoded: '0x05',
      },
    });
  });
});

describe('ledger evidence schemas', () => {
  it('preserves the current public Taira state-finality carrier without claiming verification', () => {
    const parsed = StateFinalityResponse.parse(stateFinality);
    expect(parsed).toEqual(stateFinality);
    expect(parsed.height).toBe(12);
    expect(parsed.finality_proof.committee).toHaveLength(4);
    expect(parsed.finality_proof.block_wire).toHaveLength(16411);
  });

  it.each([
    { ...stateFinality, witnessed_post_state_root: undefined },
    { ...stateFinality, block_header: undefined },
    { ...stateFinality, finality_proof: undefined },
    { ...stateFinality, source: 'commit_qc' },
    { ...stateFinality, state_root: stateFinality.witnessed_post_state_root },
    { ...stateFinality, locally_verified: true },
    { ...stateFinality, finality_proof: { ...stateFinality.finality_proof, block_wire: [256] } },
    { ...stateFinality, finality_proof: { ...stateFinality.finality_proof, committee: [] } },
  ])('rejects incomplete, retired or malformed finality evidence', (payload) => {
    expect(() => StateFinalityResponse.parse(payload)).toThrow();
  });
});

describe('Explorer payload schemas', () => {
  it('normalizes Ministry agenda draft requests and records to canonical authority and hash fields', () => {
    const request = MinistryAgendaProposalDraftRequest.parse({
      proposal: { proposal_id: 'AC-2026-001' },
      authority: validAccountId,
    });
    const record = MinistryAgendaProposalRecord.parse({
      proposal: { proposal_id: 'AC-2026-001' },
      authority: validAccountId,
      submitted_tx_hash_hex: `hash:${'ab'.repeat(32)}#cdef`,
      submitted_height: 42,
    });

    expect(request.authority).toBe(validAccountId);
    expect(record.authority).toBe(validAccountId);
    expect(record.submitted_tx_hash_hex).toBe('ab'.repeat(32));
  });

  it('parses Ministry agenda draft/get responses and transaction receipts with canonical hash fields', () => {
    const draft = MinistryAgendaProposalDraftResponse.parse({
      ok: true,
      agenda_proposal_id: 'AC-2026-001',
      authority: validAccountId,
      tx_instructions: [{ kind: 'Custom' }],
      signable_transaction_b64: 'AQID',
    });
    const getResponse = MinistryAgendaProposalGetResponse.parse({
      found: true,
      record: {
        proposal: { proposal_id: 'AC-2026-001' },
        authority: validAccountId,
        submitted_tx_hash_hex: `0x${'cd'.repeat(32)}`,
        submitted_height: 44,
      },
    });
    const receipt = TransactionSubmissionReceiptResponse.parse({
      payload: {
        tx_hash: `hash:${'ef'.repeat(32)}#0123`,
        submitted_at_ms: 1_770_000_000_000,
        submitted_at_height: 44,
        signer: validAccountId,
      },
      signature: 'ed25519:signature',
    });

    expect(draft.authority).toBe(validAccountId);
    expect(draft.tx_instructions).toHaveLength(1);
    expect(getResponse.record?.submitted_tx_hash_hex).toBe('cd'.repeat(32));
    expect(receipt.payload.tx_hash).toBe('ef'.repeat(32));
  });

  it('parses pipeline transaction status payloads and preserves nullable rejection data', () => {
    const committed = PipelineTransactionStatusResponse.parse({
      hash: `0x${'11'.repeat(32)}`,
      status: {
        kind: 'Committed',
        block_height: 45,
      },
      scope: 'auto',
      resolved_from: 'local',
    });
    const rejected = PipelineTransactionStatusResponse.parse({
      hash: `hash:${'22'.repeat(32)}#abcd`,
      status: {
        kind: 'Rejected',
        block_height: null,
        rejection_reason: { message: 'duplicate proposal' },
      },
      scope: 'global',
      resolved_from: 'archive',
    });

    expect(committed.hash).toBe('11'.repeat(32));
    expect(committed.status.block_height).toBe(45);
    expect(rejected.hash).toBe('22'.repeat(32));
    expect(rejected.status.rejection_reason).toEqual({ message: 'duplicate proposal' });
  });

  it('parses SoraFS CID lookup payloads with moderation details', () => {
    const parsed = SorafsCidLookupResponse.parse({
      content_cid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
      manifest_digest_hex: '19'.repeat(32),
      manifest_id_hex: 'aa'.repeat(32),
      index_document: 'index.html',
      files: [
        {
          path: ['index.html'],
          offset: 0,
          size: 455,
          first_chunk: 0,
          chunk_count: 1,
        },
      ],
      moderation: {
        status: 'mixed_blocked',
        public_links_enabled: false,
        matches: [
          {
            scope: 'local',
            match_kind: 'cid',
            pack_id: null,
            policy_tier: 'emergency',
            reason: 'local operator quarantine',
            jurisdiction: 'US',
            issued_at: '2026-04-06T00:00:00Z',
            expires_at: '2026-04-07T00:00:00Z',
            review_due_at: '2026-04-06T12:00:00Z',
            issued_by_proposal_id: null,
            review_reference: null,
            governance_reference: null,
            pack_manifest_cid: null,
            merkle_root: null,
          },
        ],
      },
    });

    expect(parsed.moderation?.status).toBe('mixed_blocked');
    expect(parsed.moderation?.matches[0]?.match_kind).toBe('cid');
    expect(parsed.moderation?.matches[0]?.review_due_at).toBe('2026-04-06T12:00:00Z');
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

    expect(parsed.i105_address).toBe(validAccountId);
    expect(parsed.id).toBe(validAccountId);
    expect(parsed.network_prefix).toBe(0);
  });

  it.each([
    ['missing network prefix', { network_prefix: undefined }],
    ['legacy compressed address', { compressed_address: 'sora5AbCDeFG1234XYZ9876qwerty' }],
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
    expect(parsed.i105_address).toBe(validAccountIdModern);
    expect(parsed.network_prefix).toBe(753);
    expect(parsed.owned_assets).toBe(1);
  });

  it('preserves exact account permission payloads and requires an explicit continuation', () => {
    const parsed = AccountPermissionsResponse.parse({ nextCursor: null,
      items: [
        {
          name: 'CanTransferAssetWithDefinition',
          payload: { asset_definition: validAssetDefinitionId, limit: '100000000000000000001' },
        },
      ],
    });

    expect(parsed.items[0]?.payload).toEqual({
      asset_definition: validAssetDefinitionId,
      limit: '100000000000000000001',
    });
    expect(() =>
      AccountPermissionsResponse.parse({ items: [] })
    ).toThrow(/nextCursor/u);
  });

  it('accepts bounded permission pages without inventing a total', () => {
    const parsed = AccountPermissionsResponse.parse({ nextCursor: null,
      items: [],
    });

    expect('total' in parsed).toBe(false);
    expect(parsed.nextCursor).toBeNull();
  });

  it('preserves exact indexed account-history quantities and evidence fields', () => {
    const parsed = AccountHistoryResponse.parse({ nextCursor: null,
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
    });

    expect(parsed.items[0]?.amount).toBe('100000000000000000001.000000000000000001');
    expect(parsed.nextCursor).toBeNull();
    expect(() =>
      AccountHistoryResponse.parse({
        ...parsed,
        items: [{ ...parsed.items[0], amount: 10 }],
      })
    ).toThrow();
  });

  it('accepts terminal account-history pages without index metadata or totals', () => {
    const exact = AccountHistoryResponse.parse({ nextCursor: null,
      items: [],
    });
    const bounded = AccountHistoryResponse.parse({ nextCursor: null,
      items: [],
    });

    expect(exact.nextCursor).toBeNull();
    expect('indexed_height' in exact).toBe(false);
    expect('total' in bounded).toBe(false);
    expect(bounded.nextCursor).toBeNull();
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
  ])('rejects retired $query_source counted-history envelopes', (source) => {
    expect(() =>
      AccountHistoryResponse.parse({
        items: [],
        has_more: false,
        count_mode: 'exact',
        ...source,
      })
    ).toThrow(/nextCursor/u);
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

  it('parses governance deploy proposals that use contract_address payloads', () => {
    const parsed = GovernanceProposalResponse.parse({
      found: true,
      proposal: {
        proposer: validAccountId,
        kind: {
          kind: 'DeployContract',
          payload: {
            contract_address: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
            contract_alias: 'reward-garden::universal',
            dataspace: 'universal',
            code_hash_hex: 'aa'.repeat(32),
            abi_hash_hex: 'bb'.repeat(32),
            abi_version: 1,
          },
        },
        created_height: 42,
        status: 'Approved',
      },
    });

    expect(parsed.proposal?.kind.kind).toBe('DeployContract');
    expect(parsed.proposal?.kind.payload.contract_address).toBe(
      'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7'
    );
    expect(parsed.proposal?.kind.payload.contract_alias).toBe('reward-garden::universal');
    expect(parsed.proposal?.kind.payload.dataspace).toBe('universal');
    expect(parsed.proposal?.kind.payload.abi_version).toBe('1');
  });

  it('keeps legacy governance deploy proposal fields available for historical payloads', () => {
    const parsed = GovernanceProposalResponse.parse({
      found: true,
      proposal: {
        proposer: validAccountId,
        kind: {
          kind: 'DeployContract',
          payload: {
            namespace: 'apps',
            contract_id: 'legacy-reward-garden',
            code_hash_hex: 'cc'.repeat(32),
            abi_hash_hex: 'dd'.repeat(32),
            abi_version: '2',
          },
        },
        created_height: 43,
        status: 'Enacted',
      },
    });

    expect(parsed.proposal?.kind.payload.contract_address).toBeNull();
    expect(parsed.proposal?.kind.payload.namespace).toBe('apps');
    expect(parsed.proposal?.kind.payload.contract_id).toBe('legacy-reward-garden');
    expect(parsed.proposal?.kind.payload.abi_version).toBe('2');
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

  it('parses latest transaction collection pages', () => {
    const parsed = LatestTransactionsResponse.parse({
      nextCursor: null,
      items: [
        {
          authority: validAccountId,
          hash: '0xlatest',
          block: 99,
          created_at: '2026-03-05T06:00:01Z',
          executable: 'Instructions',
          status: 'Committed',
        },
      ],
    });

    expect(parsed.items[0]?.hash).toBe('0xlatest');
  });

  it('preserves halfwidth latest transaction authorities from Torii', () => {
    const parsed = LatestTransactionsResponse.parse({
      nextCursor: null,
      items: [
        {
          authority: validAccountId,
          hash: '0xlatest-halfwidth',
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
      nextCursor: null,
        items: [
          {
            authority: 'sorauロ1NラhBUd2BツヲトiヤニツヌKSテaリメモQラrメoリナnウリbQウQJニLJ5HSE',
            hash: '0xlatest-fullwidth',
            block: 101,
            created_at: '2026-03-05T06:00:01Z',
            executable: 'Instructions',
            status: 'Committed',
          },
        ],
      })
    ).toThrow();
  });

  it('parses transaction collections with exact mixed Base58 + kana authority ids', () => {
    const parsed = CollectionPage(Transaction).parse({
      nextCursor: null,
      items: [
        {
          authority: validAccountIdModern,
          hash: '0xmixed-authority',
          block: 37,
          created_at: '2026-03-28T18:44:03.003Z',
          executable: 'Instructions',
          status: 'Rejected',
        },
      ],
    });

    expect(parsed.items[0]?.authority).toBe(validAccountIdModern);
    expect(parsed.items[0]?.hash).toBe('0xmixed-authority');
  });

  it.each([
    { items: [], pagination: { next_cursor: null } },
    { items: [], nextCursor: '' },
    { items: [], nextCursor: null, total: 0 },
    { items: [], nextCursor: null, snapshot_height: 37 },
  ])('rejects retired metadata and invalid collection continuations %j', (page) => {
    expect(CollectionPage(Transaction).safeParse(page).success).toBe(false);
  });

  it('parses latest instruction collection pages', () => {
    const parsed = LatestInstructionsResponse.parse({
      nextCursor: null,
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
                object: { type: 'Domain', id: 'wonderland' },
                owner: validAccountId,
              },
            },
          },
        },
      ],
    });

    expect(parsed.items[0]?.kind).toBe('Register');
  });

  it('parses soracloud status snapshots with control-plane sections', () => {
    const parsed = SoracloudStatus.parse({
      schema_version: 1,
      service_health: {
        mode: 'embedded_runtime_manager',
        status: 'healthy',
        message: 'runtime healthy',
        observed_height: 123,
        observed_block_hash: '0xblock',
        state_dir: '/tmp/soracloud/runtime',
        service_revisions: 4,
        healthy_service_revisions: 3,
        hydrating_service_revisions: 1,
        degraded_service_revisions: 0,
        unavailable_service_revisions: 0,
        apartments: 2,
        running_apartments: 2,
        expired_apartments: 0,
      },
      routing: {
        nexus_enabled: true,
        lane_count: 3,
        dataspace_count: 7,
        routing_rules: 8,
        default_lane_id: 0,
        default_dataspace_id: 0,
      },
      resource_pressure: {
        queue_active: 2,
        queue_queued: 5,
        queue_capacity: 32,
        queue_saturated: false,
        high_load_threshold: 16,
        high_load: false,
        runtime: {
          enabled: true,
          state_dir: '/tmp/soracloud/runtime',
          observed_height: 123,
          service_revisions: 4,
          apartments: 2,
          max_load_factor_bps: 9150,
          reported_pending_mailbox_messages: 7,
          authoritative_pending_mailbox_messages: 9,
          bundle_cache_misses: 1,
          artifact_cache_misses: 3,
        },
      },
      failed_admissions: {
        available: true,
        total: 11,
        governance_manifest_rejected: 4,
        sorafs_provider_rejected: 7,
      },
      runtime_manager: {
        available: true,
        state_dir: '/tmp/soracloud/runtime',
        snapshot: {},
      },
      control_plane: {
        schema_version: 1,
        service_count: 1,
        audit_event_count: 2,
        services: [
          {
            service_name: 'web_portal',
            current_version: '2.0.0',
            revision_count: 2,
            config_generation: 3,
            secret_generation: 1,
            config_entry_count: 5,
            secret_entry_count: 2,
            latest_revision: {
              sequence: 4,
              action: { kind: 'Rollout' },
              service_version: '2.0.0',
              replicas: 3,
              route_host: 'portal.sora.org',
              route_path_prefix: '/app',
              state_binding_count: 1,
              signed_by: 'alice@sora',
            },
            active_rollout: { status: 'running' },
            last_rollout: null,
          },
        ],
        recent_audit_events: [
          {
            sequence: 9,
            action: 'Upgrade',
            service_name: 'web_portal',
            from_version: '1.9.0',
            to_version: '2.0.0',
            governance_tx_hash: '0xabc',
          },
        ],
      },
    });

    expect(parsed.service_health.status).toBe('healthy');
    expect(parsed.control_plane.services[0]?.latest_revision?.route_path_prefix).toBe('/app');
    expect(parsed.control_plane.recent_audit_events[0]?.governance_tx_hash).toBe('0xabc');
  });

  it('defaults optional soracloud status counters when runtime sections are sparse', () => {
    const parsed = SoracloudStatus.parse({
      schema_version: 1,
      service_health: {
        mode: 'embedded_runtime_manager',
        status: 'unavailable',
        message: 'runtime unavailable',
      },
      routing: {},
      resource_pressure: {
        runtime: {
          enabled: false,
        },
      },
      failed_admissions: {},
      runtime_manager: {
        available: false,
      },
      control_plane: {
        schema_version: 1,
        service_count: 0,
        audit_event_count: 0,
      },
    });

    expect(parsed.service_health.observed_height).toBeNull();
    expect(parsed.failed_admissions.total).toBe(0);
    expect(parsed.resource_pressure.runtime.reported_pending_mailbox_messages).toBe(0);
    expect(parsed.control_plane.services).toEqual([]);
    expect(parsed.control_plane.recent_audit_events).toEqual([]);
  });

  it('parses soracloud service config and secret inspector payloads', () => {
    const config = SoracloudServiceConfigStatusResponse.parse({
      schema_version: 1,
      service_name: 'web_portal',
      current_version: '2.0.0',
      config_generation: 3,
      config_entry_count: 1,
      configs: [
        {
          config_name: 'ui/theme',
          value_hash: '0xconfig',
          value_json: { palette: 'daybreak' },
          last_update_sequence: 88,
        },
      ],
    });
    const secrets = SoracloudServiceSecretStatusResponse.parse({
      schema_version: 1,
      service_name: 'web_portal',
      current_version: '2.0.0',
      secret_generation: 5,
      secret_entry_count: 1,
      secrets: [
        {
          secret_name: 'jwt/signing-key',
          encryption: { kind: 'sealed-box' },
          key_id: 'kms/key-1',
          key_version: 2,
          commitment: '0xcommitment',
          ciphertext_bytes: 1024,
          last_update_sequence: 89,
        },
      ],
    });

    expect(config.configs[0]?.config_name).toBe('ui/theme');
    expect(config.configs[0]?.value_json).toEqual({ palette: 'daybreak' });
    expect(secrets.secrets[0]?.commitment).toBe('0xcommitment');
    expect(secrets.secrets[0]?.encryption).toEqual({ kind: 'sealed-box' });
  });

  it('parses soracloud training, weight, and artifact inspector payloads', () => {
    const training = SoracloudTrainingJobStatusResponse.parse({
      schema_version: 1,
      job: {
        service_name: 'trainer',
        model_name: 'llm-demo',
        job_id: 'job-1',
        status: 'Running',
        worker_group_size: 2,
        target_steps: 1000,
        completed_steps: 250,
        checkpoint_interval_steps: 100,
        last_checkpoint_step: 200,
        checkpoint_count: 2,
        retry_count: 1,
        max_retries: 3,
        step_compute_units: 10,
        compute_budget_units: 10000,
        compute_consumed_units: 2500,
        compute_remaining_units: 7500,
        storage_budget_bytes: 2048,
        storage_consumed_bytes: 1024,
        storage_remaining_bytes: 1024,
        latest_metrics_hash: '0xmetrics',
        last_failure_reason: null,
        created_sequence: 101,
        updated_sequence: 130,
      },
    });
    const weights = SoracloudModelWeightStatusResponse.parse({
      schema_version: 1,
      model: {
        service_name: 'trainer',
        model_name: 'llm-demo',
        current_version: 'v2',
        version_count: 2,
        versions: [
          {
            weight_version: 'v2',
            parent_version: 'v1',
            training_job_id: 'job-1',
            weight_artifact_hash: '0xartifact',
            dataset_ref: 'dataset://demo',
            training_config_hash: '0xconfig',
            reproducibility_hash: '0xrepro',
            provenance_attestation_hash: '0xprov',
            registered_sequence: 55,
            promoted_sequence: 56,
            gate_report_hash: null,
          },
        ],
      },
    });
    const artifacts = SoracloudModelArtifactStatusResponse.parse({
      schema_version: 1,
      service_name: 'trainer',
      model_name: 'llm-demo',
      artifact_count: 1,
      artifact: {
        service_name: 'trainer',
        model_name: 'llm-demo',
        artifact_id: 'artifact-1',
        training_job_id: 'job-1',
        weight_version: 'v2',
        weight_artifact_hash: '0xartifact',
        dataset_ref: 'dataset://demo',
        training_config_hash: '0xconfig',
        reproducibility_hash: '0xrepro',
        provenance_attestation_hash: '0xprov',
        registered_sequence: 55,
        consumed_by_version: null,
        private_bundle_root: '0xbundle',
        compile_profile_hash: '0xprofile',
        chunk_manifest_root: '0xmanifest',
        privacy_mode: { kind: 'private' },
      },
      artifacts: [],
    });

    expect(training.job.compute_remaining_units).toBe(7500);
    expect(weights.model.versions[0]?.parent_version).toBe('v1');
    expect(artifacts.artifact.private_bundle_root).toBe('0xbundle');
    expect(artifacts.artifact.privacy_mode).toEqual({ kind: 'private' });
  });

  it('parses soracloud upload, inference, and HF lease inspector payloads', () => {
    const upload = SoracloudUploadedModelStatusResponse.parse({
      schema_version: 1,
      bundle: { model_id: 'model-1', weight_version: 'v2' },
      uploaded_chunk_count: 3,
      chunk_ordinals: [0, 1, 2],
      compile_profile: { backend: 'cuda' },
      artifact: {
        service_name: 'trainer',
        model_name: 'llm-demo',
        artifact_id: 'artifact-1',
        training_job_id: 'job-1',
        weight_version: 'v2',
        weight_artifact_hash: '0xartifact',
        dataset_ref: 'dataset://demo',
        training_config_hash: '0xconfig',
        reproducibility_hash: '0xrepro',
        provenance_attestation_hash: '0xprov',
        registered_sequence: 55,
        consumed_by_version: null,
        private_bundle_root: null,
        compile_profile_hash: null,
        chunk_manifest_root: null,
        privacy_mode: null,
      },
    });
    const inference = SoracloudPrivateInferenceStatusResponse.parse({
      schema_version: 1,
      session: { session_id: 'session-1', apartment_name: 'tenant-a' },
      checkpoint_count: 1,
      checkpoints: [{ step: 1, artifact_hash: '0xcheckpoint' }],
    });
    const hfLease = SoracloudHfSharedLeaseStatusResponse.parse({
      schema_version: 1,
      source: { repo_id: 'org/model', revision: 'main' },
      runtime_projection: { selected_backend: 'gguf' },
      pool: { pool_id: 'pool-1' },
      member: { account_id: validAccountId },
      placement: { placement_id: 'place-1' },
      latest_audit_event: { action: 'Warm' },
      audit_event_count: 4,
      storage_base_fee_nanos: '1000',
      compute_reservation_fee_nanos: '2000',
      eligible_host_count: 3,
      warm_host_count: 2,
      importer_pending: true,
    });

    expect(upload.chunk_ordinals).toEqual([0, 1, 2]);
    expect(inference.checkpoints[0]?.artifact_hash).toBe('0xcheckpoint');
    expect(hfLease.storage_base_fee_nanos).toBe('1000');
    expect(hfLease.member).toEqual({ account_id: validAccountId });
  });

  it('parses soracloud host and agent inspector payloads', () => {
    const modelHosts = SoracloudModelHostStatusResponse.parse({
      schema_version: 1,
      validator_account_id: validAccountId,
      active_host_count: 1,
      hosts: [{ host_id: 'host-1', gpu: 'A100' }],
    });
    const agents = SoracloudAgentStatusResponse.parse({
      schema_version: 1,
      apartment_count: 1,
      event_count: 2,
      apartments: [
        {
          apartment_name: 'tenant-a',
          manifest_hash: '0xmanifest',
          status: 'Running',
          lease_started_sequence: 10,
          lease_expires_sequence: 50,
          lease_remaining_ticks: 40,
          restart_count: 1,
          state_quota_bytes: 1024,
          tool_capability_count: 2,
          policy_capability_count: 3,
          revoked_policy_capability_count: 1,
          pending_wallet_request_count: 0,
          pending_mailbox_message_count: 2,
          autonomy_budget_ceiling_units: 1000,
          autonomy_budget_remaining_units: 800,
          artifact_allowlist_count: 4,
          autonomy_run_count: 5,
          process_generation: 1,
          process_started_sequence: 12,
          last_active_sequence: 15,
          last_checkpoint_sequence: null,
          checkpoint_count: 1,
          persistent_state_total_bytes: 128,
          persistent_state_key_count: 3,
          spend_limit_count: 2,
          upgrade_policy: { kind: 'managed' },
          last_restart_sequence: 14,
          last_restart_reason: 'operator restart',
        },
      ],
    });
    const mailbox = SoracloudAgentMailboxStatusResponse.parse({
      schema_version: 1,
      apartment_name: 'tenant-a',
      status: 'Running',
      pending_message_count: 2,
      event_count: 5,
      messages: [
        {
          message_id: 'message-1',
          from_apartment: 'coordinator',
          channel: 'status',
          payload: '{"ok":true}',
          payload_hash: '0xpayload',
          enqueued_sequence: 33,
        },
      ],
    });
    const autonomy = SoracloudAgentAutonomyStatusResponse.parse({
      apartment_name: 'tenant-a',
      sequence: 44,
      status: 'Running',
      lease_expires_sequence: 50,
      lease_remaining_ticks: 6,
      manifest_hash: '0xmanifest',
      revoked_policy_capability_count: 1,
      budget_ceiling_units: 1000,
      budget_remaining_units: 700,
      allowlist_count: 1,
      run_count: 2,
      process_generation: 1,
      process_started_sequence: 12,
      last_active_sequence: 45,
      last_checkpoint_sequence: 40,
      checkpoint_count: 3,
      persistent_state_total_bytes: 128,
      persistent_state_key_count: 2,
      allowlist: [{ artifact_hash: 'artifact-1', provenance_hash: null, added_sequence: 20 }],
      recent_runs: [
        {
          run_id: 'run-1',
          artifact_hash: 'artifact-1',
          provenance_hash: null,
          budget_units: 50,
          run_label: 'daily-sync',
          workflow_input_json: '{"prompt":"ok"}',
          approved_sequence: 30,
          authoritative_runtime_receipt: { receipt_id: '0xreceipt' },
          authoritative_execution_audit: { sequence: 31, succeeded: true },
        },
      ],
      runtime_recent_runs: [{ run_id: 'run-1', error: null }],
    });

    expect(modelHosts.hosts[0]?.gpu).toBe('A100');
    expect(agents.apartments[0]?.upgrade_policy).toEqual({ kind: 'managed' });
    expect(mailbox.messages[0]?.payload).toBe('{"ok":true}');
    expect(autonomy.recent_runs[0]?.authoritative_runtime_receipt).toEqual({ receipt_id: '0xreceipt' });
    expect(autonomy.runtime_recent_runs[0]).toEqual({ run_id: 'run-1', error: null });
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
          return_type: null,
          permission: null,
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

  it('parses verified-source job responses with nullable fields', () => {
    const parsed = ContractVerifiedSourceJobResponse.parse({
      job_id: 'job-1',
      code_hash: 'aa'.repeat(32),
      status: 'mismatch',
      submitted_at: '2026-03-28T00:00:00Z',
      completed_at: '2026-03-28T00:00:01Z',
      message: 'compiled source does not match the requested code hash',
      actual_code_hash: 'bb'.repeat(32),
      verified_source_ref: null,
    });

    expect(parsed.status).toBe('mismatch');
    expect(parsed.actual_code_hash).toBe('bb'.repeat(32));
    expect(parsed.verified_source_ref).toBeNull();
  });

  it('accepts Ivm executable values in transaction payloads', () => {
    const parsed = Transaction.parse({
      authority: validAccountId,
      hash: '0xivm',
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
      hash: '0xivmproved',
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
      hash: '0xcontractcall',
      block: 9,
      created_at: '2026-02-24T09:30:58.03Z',
      executable: 'ContractCall',
      status: 'Committed',
    });

    expect(parsed.executable).toBe('ContractCall');
  });

  it('normalizes partial peer_info bootstrap payloads from telemetry SSE', () => {
    const parsed = PeerMetrics.parse({
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
    });

    expect(parsed.kind).toBe('first');
    if (parsed.kind !== 'first') {
      throw new Error('expected first telemetry payload');
    }
    expect(parsed.peers_info[0]?.config).toBeNull();
    expect(parsed.peers_info[0]?.location).toBeNull();
    expect(parsed.peers_info[0]?.connected_peers).toBeNull();
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
      name: 'USD',
      description: null,
      mintable: 'Limited(42)',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      total_quantity: '200',
    });

    expect(parsed.mintable).toBe('Limited(42)');
    expect(parsed.owning_domain).toBe('issuer.main');
    expect(parsed.alias).toBe(exactAlias);
    expect(parsed.alias_binding?.alias).toBe(exactAlias);
    expect(parsed.name).toBe('USD');
    expect(parsed.total_quantity.toString()).toBe('200');
    expect(parsed.assets).toBeNull();
    expect(parsed.locked_quantity).toBeNull();
    expect(parsed.circulating_quantity).toBeNull();
  });

  it('parses nullable ownership and alias fields on the full asset-definition route', () => {
    const parsed = AssetDefinition.parse({
      id: validAssetDefinitionId,
      owning_domain: null,
      alias: null,
      name: 'usd',
      description: null,
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      total_quantity: '0',
    });

    expect(parsed.owning_domain).toBeNull();
    expect(parsed.alias).toBeNull();
    expect(parsed.alias_binding).toBeNull();
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
    expect(parsed.alias).toBeNull();
    expect(parsed.name).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it('preserves valid on-chain alias spelling and enforces asset text/domain bounds', () => {
    const payload = {
      id: validAssetDefinitionId,
      owning_domain: 'issuer.main',
      name: 'USD',
      description: 'Settlement asset',
      alias: 'USD#Issuer.Main',
      mintable: 'Infinitely',
      logo: null,
      metadata: {},
      owned_by: validAccountId,
      total_quantity: '0',
    };

    expect(AssetDefinition.parse(payload).alias).toBe('USD#Issuer.Main');
    expect(AssetDefinition.safeParse({ ...payload, owning_domain: 'Issuer.main' }).success).toBe(false);
    expect(AssetDefinition.safeParse({ ...payload, name: ' '.repeat(4) }).success).toBe(false);
    expect(AssetDefinition.safeParse({ ...payload, name: 'a'.repeat(129) }).success).toBe(false);
    expect(AssetDefinition.safeParse({ ...payload, description: '  ' }).success).toBe(false);
    expect(AssetDefinition.safeParse({ ...payload, alias: 'EUR#Issuer.Main' }).success).toBe(false);
    expect(
      AssetDefinition.safeParse({
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

  it.each(['name', 'description', 'alias'])('rejects detail-only field %s in an Explorer list DTO', (field) => {
    expect(ExplorerAssetDefinition.safeParse({
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
      [field]: 'usd',
    }).success).toBe(false);
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

  it('parses asset-definition snapshot payloads (distribution + top holders)', () => {
    const parsed = AssetDefinitionSnapshot.parse({
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
    });

    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.total_supply.toString()).toBe('200');
    expect(parsed.top_holders[0]?.balance.toString()).toBe('100');
    expect(parsed.distribution.hhi).toBe(0.5);
    expect(parsed.distribution.median?.toString()).toBe('100');
    expect(parsed.distribution.lorenz).toHaveLength(2);
    expect(parsed.distribution.nakamoto_51).toBe(2);
  });

  it('parses explorer asset instances with canonical base58 definitions and alias metadata', () => {
    const parsed = Asset.parse({
      id: validAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      asset_name: 'usd',
      asset_alias: validAssetDefinitionAlias,
      value: '13',
    });

    expect(parsed.id).toBe(validAssetId);
    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.account_id).toBe(validAccountId);
    expect(parsed.asset_name).toBe('usd');
    expect(parsed.asset_alias).toBe(validAssetDefinitionAlias);
    expect(parsed.value.toString()).toBe('13');
  });

  it('parses the exact current Explorer asset DTO including dataspace-scoped ids', () => {
    const scopedAssetId = `${validAssetId}#dataspace:7`;
    const parsed = ExplorerAsset.parse({
      id: scopedAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      asset_name: 'usd',
      asset_alias: validAssetDefinitionAlias,
      value: '13',
    });

    expect(parsed.id).toBe(scopedAssetId);
    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.account_id).toBe(validAccountId);
    expect(parsed.value.toString()).toBe('13');
    expect(parsed.asset_name).toBe('usd');
    expect(parsed.asset_alias).toBe(validAssetDefinitionAlias);
    expect(parsed.scope).toBe('dataspace:7');
  });

  it('preserves exact asset alias spelling and rejects noncanonical response ids', () => {
    const payload = {
      id: validAssetId,
      definition_id: validAssetDefinitionId,
      account_id: validAccountId,
      asset_name: 'USD',
      asset_alias: 'USD#Issuer.Main',
      value: '13',
    };

    expect(ExplorerAsset.parse(payload).asset_alias).toBe('USD#Issuer.Main');
    expect(ExplorerAsset.safeParse({ ...payload, id: ` ${validAssetId}` }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, asset_name: '' }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, definition_id: alternateAssetDefinitionId }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, account_id: validAccountIdAlt }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, account_id: 'sora1' }).success).toBe(false);
    expect(ExplorerAsset.safeParse({ ...payload, asset_alias: 'EUR#Issuer.Main' }).success).toBe(false);
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
      asset_name: 'usd',
      asset_alias: validAssetDefinitionAlias,
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
        asset_name: 'usd',
        asset_alias: validAssetDefinitionAlias,
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

  it('parses v1 account-asset and holder payloads into the shared asset shape', () => {
    const parsed = Asset.parse({
      asset: validAssetDefinitionId,
      account_id: validAccountId,
      asset_name: 'usd',
      asset_alias: validAssetDefinitionAlias,
      quantity: '42',
      scope: 'global',
    });

    expect(parsed.id).toBe(`${validAssetDefinitionId}@${validAccountId}:global`);
    expect(parsed.definition_id).toBe(validAssetDefinitionId);
    expect(parsed.account_id).toBe(validAccountId);
    expect(parsed.asset_name).toBe('usd');
    expect(parsed.asset_alias).toBe(validAssetDefinitionAlias);
    expect(parsed.value.toString()).toBe('42');
    expect(parsed.scope).toBe('global');
  });

  it('parses sumeragi snapshots that expose renamed counters and omit optional sections', () => {
    const parsed = SumeragiStatus.parse({
      leader_index: 0,
      view_change_index: 0,
      highest_qc: { height: 10, view: 0, subject_block_hash: '0xaaa' },
      locked_qc: { height: 10, view: 0, subject_block_hash: '0xaaa' },
      tx_queue: { depth: 0, capacity: 10, saturated: false },
      epoch: { length_blocks: 3600, commit_deadline_offset: 100, reveal_deadline_offset: 140 },
      membership: { height: 10, view: 0, epoch: 0, view_hash: null },
      prf: { height: 10, view: 0, epoch_seed: null },
      gossip_fallback_total: 2,
      bg_post_drop_post_total: 3,
      bg_post_drop_broadcast_total: 4,
      block_created_dropped_by_lock_total: 0,
      block_created_hint_mismatch_total: 0,
      block_created_proposal_mismatch_total: 0,
      settlement: {
        dvp: {
          success_total: 0,
          failure_total: 0,
          final_state_totals: {},
          failure_reasons: {},
          last_event: null,
        },
        pvp: {
          success_total: 0,
          failure_total: 0,
          final_state_totals: {},
          failure_reasons: {},
          last_event: null,
        },
      },
      pacemaker_backpressure_deferrals_total: 1,
      da_reschedule_total: 0,
      rbc_store: {
        sessions: 1,
        bytes: 128,
        pressure_level: 0,
        backpressure_deferrals_total: 0,
        evictions_total: 0,
        recent_evictions: [],
      },
      view_change_proof_accepted_total: 0,
      view_change_proof_stale_total: 0,
      view_change_proof_rejected_total: 0,
      view_change_suggest_total: 0,
      view_change_install_total: 0,
      collectors_targeted_current: 0,
      collectors_targeted_last_per_block: 3,
      redundant_sends_total: 4,
      vrf_penalty_epoch: 1,
      vrf_committed_no_reveal_total: 1,
      vrf_no_participation_total: 0,
      vrf_late_reveals_total: 0,
      lane_governance: [],
      npos_election: null,
    });

    expect(parsed.bg_post_inline_post_total).toBe(3);
    expect(parsed.bg_post_inline_broadcast_total).toBe(4);
    expect(parsed.rbc_retry_attempts_total).toBe(0);
    expect(parsed.nexus_fee.charged_total).toBe(0);
    expect(parsed.nexus_staking.lanes).toEqual([]);
    expect(parsed.lane_governance_sealed_aliases).toEqual([]);
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
          accounts: [validAccountId, 'treasury@banking.retail'],
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

  it('parses the signed ABI23 transaction detail without a fabricated fee field', () => {
    const parsed = DetailedTransaction.parse({
      authority: validAccountId,
      hash: '0xabc',
      block: 1,
      created_at: '2024-01-01T00:00:00Z',
      executable: 'Instructions',
      status: 'Committed',
      rejection_reason: null,
      executable_payload: { instruction_count: 2 },
      metadata: {},
      nonce: null,
      signature: 'ed0120deadbeef',
      time_to_live: null,
    });

    expect(parsed.executable_payload).toEqual({ instruction_count: 2 });
    expect(parsed).not.toHaveProperty('fee_payment');
  });

  it('accepts transaction rejection reasons with plain-string json payloads', () => {
    const parsed = DetailedTransaction.parse({
      authority: validAccountId,
      hash: '0xabc',
      block: 1,
      created_at: '2024-01-01T00:00:00Z',
      executable: 'Instructions',
      status: 'Rejected',
      rejection_reason: {
        encoded: '0x01',
        json: 'Account permission denied',
        message: 'Validation failed: Account permission denied',
      },
      executable_payload: { instruction_count: 1 },
      metadata: {},
      nonce: null,
      signature: 'ed0120deadbeef',
      time_to_live: null,
    });

    expect(parsed.rejection_reason?.json).toBe('Account permission denied');
    expect(parsed.rejection_reason?.message).toBe('Validation failed: Account permission denied');
  });

  it('rejects transaction rejection reasons that use scale instead of encoded', () => {
    expect(() =>
      DetailedTransaction.parse({
        authority: validAccountId,
        hash: '0xabc',
        block: 1,
        created_at: '2024-01-01T00:00:00Z',
        executable: 'Instructions',
        status: 'Rejected',
        rejection_reason: {
          scale: '0x01',
          json: 'Account permission denied',
        },
        executable_payload: { instruction_count: 1 },
        metadata: {},
        nonce: null,
        signature: 'ed0120deadbeef',
        time_to_live: null,
      })
    ).toThrow();
  });

  it('keeps transaction rejection reasons with object json payloads', () => {
    const parsed = DetailedTransaction.parse({
      authority: validAccountId,
      hash: '0xdef',
      block: 2,
      created_at: '2024-01-01T00:01:00Z',
      executable: 'Instructions',
      status: 'Rejected',
      rejection_reason: {
        encoded: '0x02',
        json: {
          kind: 'ValidationFail',
          details: { instruction: 0, reason: 'bad signature' },
        },
      },
      executable_payload: { instruction_count: 1 },
      metadata: {},
      nonce: 1,
      signature: 'ed0120cafebabe',
      time_to_live: { ms: 1000 },
    });

    expect(parsed.rejection_reason?.json).toEqual({
      kind: 'ValidationFail',
      details: { instruction: 0, reason: 'bad signature' },
    });
  });
});
