import { describe, expect, it } from 'vitest';
import nativeLogFixture from '../../../tests/fixtures/taira-ce5-log-instruction.json';
import stateFinality from '../../../tests/fixtures/taira-state-finality.json';
import batchTransactions from '../../../tests/fixtures/taira-batch-transactions.json';
import {
  Account,
  AccountHistoryResponse,
  Asset,
  AssetDefinitionEconometrics,
  AssetDefinitionSnapshot,
  CollectionPage,
  DataspaceId,
  DetailedTransaction,
  Domain,
  ExplorerAsset,
  ExplorerHealth,
  Instruction,
  LatestInstructionsResponse,
  LatestTransactionsResponse,
  MultisigProposalsQueryResponse,
  MultisigSpecResponse,
  NetworkMetrics,
  NexusDataspacesAccountSummary,
  NFT,
  PeerMetrics,
  RWA,
  StateFinalityResponse,
  Transaction,
  TransactionExecutable,
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

  it('rejects retired decoded JSON as a native network envelope', () => {
    expect(() =>
      Instruction.parse({
        ...baseInstruction,
        kind: 'Transfer',
        box: {
          encoded: '0x02',
          framed_sha256: validFramedInstructionSha256,
          json: {
            kind: 'Transfer',
            payload: { object: validAssetId, source: validAccountId, destination: validAccountIdAlt },
          },
        },
      })
    ).toThrow();
  });

  it('requires the exact raw SHA-256 of canonical native frame bytes', () => {
    expect(() =>
      Instruction.parse({ ...nativeLogFixture, box: { ...nativeLogFixture.box, framed_sha256: undefined } })
    ).toThrow();
    for (const digest of [
      '0'.repeat(64),
      `0x${nativeLogFixture.box.framed_sha256}`,
      nativeLogFixture.box.framed_sha256.toUpperCase(),
    ]) {
      expect(() =>
        Instruction.parse({ ...nativeLogFixture, box: { ...nativeLogFixture.box, framed_sha256: digest } })
      ).toThrow();
    }
  });

  it('requires the canonical box field rather than a retired raw-identifier alias', () => {
    const { box, ...rest } = nativeLogFixture;
    expect(() => Instruction.parse({ ...rest, 'r#box': box })).toThrow();
  });

  it('rejects scale bytes in place of the native instruction field', () => {
    const { instruction, ...rest } = nativeLogFixture.box;
    expect(() => Instruction.parse({ ...nativeLogFixture, box: { ...rest, scale: instruction } })).toThrow();
  });

  it('preserves the authoritative kind and wire identity without a decoded payload', () => {
    const parsed = Instruction.parse(nativeLogFixture);
    expect(parsed.kind).toBe('Log');
    expect(parsed.box.wire_id).toBe('iroha.log');
    expect(parsed.box.encoded).toBe(nativeLogFixture.box.instruction);
    expect(parsed.box.json).toBeNull();
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

  it('preserves exact indexed account-history quantities and evidence fields', () => {
    const parsed = AccountHistoryResponse.parse({
      nextCursor: null,
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
    const exact = AccountHistoryResponse.parse({ nextCursor: null, items: [] });
    const bounded = AccountHistoryResponse.parse({ nextCursor: null, items: [] });

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
          instructions_hash: 'bb'.repeat(32),
          operation_type: 'TRANSFER',
          intent: null,
          proposal: {
            network_id: 'hash:5C3E66C94E079079FF4FC46F59810B9C4EC7B2646DD45CE937831C0FDCE20C9B#44D9',
            proposal_nonce: 'cc'.repeat(32),
            proposal_id: 'aa'.repeat(32),
            transaction_ttl_ms: null,
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
          },
          status: 'COLLECTING_SIGNATURES',
          terminal_at_ms: null,
        },
      ],
      next_cursor: 'cursor_2',
    });

    expect(spec.spec.signatories[validAccountId]).toBe(2);
    expect(proposals.proposals[0]?.proposal.instructions[0]).toHaveProperty('Transfer.Asset');
    const entry = proposals.proposals[0]!;
    expect(entry.proposal_id).not.toBe(entry.instructions_hash);
    const parsePayload = (payload: Record<string, unknown>) =>
      MultisigProposalsQueryResponse.parse({
        ...proposals,
        proposals: [{ ...entry, proposal: payload }],
      });
    for (const field of ['network_id', 'proposal_nonce', 'proposal_id', 'transaction_ttl_ms']) {
      const missing = { ...entry.proposal } as Record<string, unknown>;
      delete missing[field];
      expect(() => parsePayload(missing), `missing ${field}`).toThrow();
    }
    for (const changed of [
      { is_relayed: null },
      { proposal_nonce: '0'.repeat(64) },
      { proposal_nonce: 'CC'.repeat(32) },
      { proposal_id: 'dd'.repeat(32) },
      { network_id: '11'.repeat(32) },
      { transaction_ttl_ms: 0 },
      { transaction_ttl_ms: Number.MAX_SAFE_INTEGER + 1 },
      { proposed_at_ms: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(() => parsePayload({ ...entry.proposal, ...changed })).toThrow();
    }
    expect(
      parsePayload({ ...entry.proposal, transaction_ttl_ms: 60_000 }).proposals[0]?.proposal.transaction_ttl_ms
    ).toBe(60_000);
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

  it('parses latest instruction collection pages', () => {
    const parsed = LatestInstructionsResponse.parse({ nextCursor: null, items: [nativeLogFixture] });
    expect(parsed.items[0]?.kind).toBe('Log');
    expect(parsed.items[0]?.box.encoded).toBe(nativeLogFixture.box.instruction);
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

  it('accepts exactly the executable labels Torii projects for Explorer transactions', () => {
    expect(TransactionExecutable.options).toEqual(['Instructions', 'ContractCall', 'Ivm', 'IvmProved', 'Batch']);
    for (const executable of TransactionExecutable.options) {
      expect(Transaction.parse({ ...batchTransactions.block_12340_page.items[0], executable }).executable).toBe(
        executable
      );
    }
    expect(() => Transaction.parse({ ...batchTransactions.batch_detail, executable: 'Wasm' })).toThrow();
    expect(() => DetailedTransaction.parse({ ...batchTransactions.batch_detail, executable: 'Wasm' })).toThrow();
  });

  it('parses the captured Taira transactions page for block 12340, whose only row is a Batch', () => {
    const page = batchTransactions.block_12340_page;
    const parsed = LatestTransactionsResponse.parse({ items: page.items, nextCursor: page.next_cursor });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ block: 12340, executable: 'Batch', status: 'Committed' });
    expect(parsed.nextCursor).toBeNull();
  });

  it('parses a captured Taira contract-call Batch detail with its item counts', () => {
    const parsed = DetailedTransaction.parse(batchTransactions.batch_detail);
    expect(parsed.executable).toBe('Batch');
    expect(parsed.executable_payload).toEqual({ item_count: 1, instruction_count: 0, contract_call_count: 1 });
    expect(parsed.metadata).toHaveProperty('contract_batch_binding_v1');
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

describe('exact public status dataspace IDs', () => {
  it('preserves the complete u64 range and zero without rounding', () => {
    expect(DataspaceId.parse(0)).toBe('0');
    expect(DataspaceId.parse(8648377547929788715n)).toBe('8648377547929788715');
    expect(DataspaceId.parse('18446744073709551615')).toBe('18446744073709551615');
  });

  it.each([8648377547929788000, -1, 1.5, '01', '1e3', '-1', '18446744073709551616'])(
    'rejects an inexact or noncanonical identity %s',
    (value) => {
      expect(DataspaceId.safeParse(value).success).toBe(false);
    }
  );
});
