import { describe, expect, it } from 'vitest';
import {
  buildTraceCsv,
  buildTraceLayout,
  computeRiskSignals,
  extractTransferEdgesFromPayload,
  findShortestPath,
  instructionToTraceEvents,
  parseAccountFromAssetLiteral,
  parseTraceBundle,
  stringifyTraceBundle,
  type TraceBundle,
} from './tracing';
import { Instruction } from '@/shared/api/schemas';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const SAMPLE_I105_THIRD = 'sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D';
const SAMPLE_ACCOUNT_ALIAS = 'alice@wonderland';
const SAMPLE_ASSET_ALIAS = 'usd#issuer.main';
const SAMPLE_ASSET_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa#sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ASSET_DEFINITION_ID = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';

describe('tracing helpers', () => {
  it('extracts only canonical i105 account ids from exact account and asset literals', () => {
    expect(parseAccountFromAssetLiteral(`${SAMPLE_ASSET_ALIAS}#${SAMPLE_ACCOUNT_ALIAS}`)).toBeNull();
    expect(parseAccountFromAssetLiteral(SAMPLE_ACCOUNT_ALIAS)).toBeNull();
    expect(parseAccountFromAssetLiteral(SAMPLE_ASSET_ID)).toBe(SAMPLE_I105);
    expect(parseAccountFromAssetLiteral(` ${SAMPLE_I105}`)).toBeNull();
    expect(parseAccountFromAssetLiteral('norito:4e52543000000002')).toBeNull();
    expect(parseAccountFromAssetLiteral(SAMPLE_ASSET_ALIAS)).toBeNull();
  });

  it('extracts transfer edges for canonical transfer variants', () => {
    const assetEdges = extractTransferEdgesFromPayload({
      variant: 'Asset',
      value: {
        source: SAMPLE_ASSET_ID,
        object: '1',
        destination: SAMPLE_I105_ALT,
      },
    });
    expect(assetEdges).toEqual([
      {
        source: SAMPLE_I105,
        target: SAMPLE_I105_ALT,
        variant: 'Asset',
        assetId: SAMPLE_ASSET_ID,
      },
    ]);

    const batchEdges = extractTransferEdgesFromPayload({
      variant: 'AssetBatch',
      value: {
        mode: { mode: 'Atomic', value: null },
        entries: [
          {
            leg_id: 'invoice-1',
            from: SAMPLE_I105,
            to: SAMPLE_I105_ALT,
            asset_definition: SAMPLE_ASSET_DEFINITION_ID,
            amount: '4.25',
          },
          {
            leg_id: 'invoice-2',
            from: SAMPLE_I105_ALT,
            to: SAMPLE_I105_THIRD,
            asset_definition: SAMPLE_ASSET_DEFINITION_ID,
            amount: '2',
          },
        ],
      },
    });
    expect(batchEdges).toHaveLength(2);
    expect(batchEdges[0]?.source).toBe(SAMPLE_I105);
    expect(batchEdges[0]?.target).toBe(SAMPLE_I105_ALT);
    expect(batchEdges[1]?.target).toBe(SAMPLE_I105_THIRD);
    expect(
      extractTransferEdgesFromPayload({
        variant: 'AssetBatch',
        value: {
          mode: { mode: 'Independent', value: null },
          entries: [
            {
              leg_id: 'independent-1',
              from: SAMPLE_I105,
              to: SAMPLE_I105_ALT,
              asset_definition: SAMPLE_ASSET_DEFINITION_ID,
              amount: '1',
            },
          ],
        },
      })
    ).toHaveLength(1);

    const domainEdge = extractTransferEdgesFromPayload({
      variant: 'Domain',
      value: {
        source: SAMPLE_I105,
        object: 'issuer.main',
        destination: SAMPLE_I105_ALT,
      },
    });
    expect(domainEdge[0]?.variant).toBe('Domain');

    const assetDefinitionEdge = extractTransferEdgesFromPayload({
      variant: 'AssetDefinition',
      value: {
        source: SAMPLE_I105,
        object: SAMPLE_ASSET_DEFINITION_ID,
        destination: SAMPLE_I105_ALT,
      },
    });
    expect(assetDefinitionEdge[0]?.variant).toBe('AssetDefinition');

    const nftEdge = extractTransferEdgesFromPayload({
      variant: 'Nft',
      value: {
        source: SAMPLE_I105,
        object: 'badge$issuer.main',
        destination: SAMPLE_I105_ALT,
      },
    });
    expect(nftEdge[0]?.variant).toBe('Nft');
  });

  it('rejects compatibility-shaped transfer payloads that omit the canonical variant envelope', () => {
    expect(
      extractTransferEdgesFromPayload({
        source: SAMPLE_I105,
        destination: SAMPLE_I105_ALT,
        object: SAMPLE_ASSET_ID,
      })
    ).toEqual([]);
  });

  it('rejects obsolete inner transfer aliases, guessed nesting, and incomplete batch entries', () => {
    expect(
      extractTransferEdgesFromPayload({
        variant: 'Asset',
        value: {
          source: SAMPLE_I105,
          object: SAMPLE_ASSET_ID,
          destination: SAMPLE_I105_ALT,
        },
      })
    ).toEqual([]);
    expect(
      extractTransferEdgesFromPayload({
        variant: 'Asset',
        value: {
          source: SAMPLE_ASSET_ID,
          object: '1',
          destination: SAMPLE_I105_ALT,
          payload: { sender: SAMPLE_I105, recipient: SAMPLE_I105_ALT },
        },
      })
    ).toEqual([]);
    expect(
      extractTransferEdgesFromPayload({
        variant: 'AssetBatch',
        value: {
          entries: [
            {
              from: SAMPLE_I105,
              to: SAMPLE_I105_ALT,
              asset_definition: SAMPLE_ASSET_DEFINITION_ID,
              amount: '1',
            },
          ],
        },
      })
    ).toEqual([]);
    for (const mode of [
      { mode: 'BestEffort', value: null },
      { mode: 'Atomic' },
      { mode: 'Independent', value: null, legacy: true },
    ]) {
      expect(
        extractTransferEdgesFromPayload({
          variant: 'AssetBatch',
          value: {
            mode,
            entries: [
              {
                leg_id: 'invoice-1',
                from: SAMPLE_I105,
                to: SAMPLE_I105_ALT,
                asset_definition: SAMPLE_ASSET_DEFINITION_ID,
                amount: '1',
              },
            ],
          },
        })
      ).toEqual([]);
    }
  });

  it('converts transfer instructions to trace events', () => {
    const transactionHash = 'ab'.repeat(32);
    const instruction = Instruction.parse({
      authority: SAMPLE_I105,
      created_at: '2026-02-26T00:00:00Z',
      kind: 'Transfer',
      index: 0,
      transaction_hash: transactionHash,
      transaction_status: 'Committed',
      block: 10,
      box: {
        encoded: '0x01',
        framed_sha256: '0xc7e4bbea488a546f542484289d335695684a5fc6180b18b3584abd7505f1cc43',
        json: {
          kind: 'Transfer',
          wire_id: 'iroha_data_model::isi::Transfer',
          encoded: '01',
          payload: {
            variant: 'Asset',
            value: {
              source: SAMPLE_ASSET_ID,
              object: '1',
              destination: SAMPLE_I105_ALT,
            },
          },
        },
      },
    });

    const events = instructionToTraceEvents(instruction);
    expect(events).toHaveLength(1);
    expect(events[0]?.transactionHash).toBe(transactionHash);
    expect(events[0]?.source).toBe(SAMPLE_I105);
    expect(events[0]?.target).toBe(SAMPLE_I105_ALT);
    expect(events[0]?.assetId).toBe(SAMPLE_ASSET_ID);
  });

  it('computes risk signals from node activity and manual labels', () => {
    const lowRisk = computeRiskSignals(
      {
        inDegree: 1,
        outDegree: 1,
        eventCount: 2,
        minGapMs: null,
      },
      null
    );
    expect(lowRisk.score).toBe(0);

    const highRisk = computeRiskSignals(
      {
        inDegree: 35,
        outDegree: 40,
        eventCount: 250,
        minGapMs: 1_000,
      },
      { tag: 'hot wallet', risky: true }
    );
    expect(highRisk.score).toBeGreaterThan(80);
    expect(highRisk.flags).toContain('high_fan_out');
    expect(highRisk.flags).toContain('manual_risky_label');
  });

  it('builds deterministic node layout and shortest paths', () => {
    const nodeA = SAMPLE_I105;
    const nodeB = SAMPLE_I105_ALT;
    const nodeC = SAMPLE_I105_THIRD;

    const layout = buildTraceLayout([
      {
        id: nodeA,
        depth: 0,
        inDegree: 0,
        outDegree: 1,
        eventCount: 1,
        firstSeenMs: 1,
        lastSeenMs: 1,
        minGapMs: null,
        risk: { score: 0, flags: [] },
        manualLabel: null,
      },
      {
        id: nodeB,
        depth: 1,
        inDegree: 1,
        outDegree: 1,
        eventCount: 2,
        firstSeenMs: 1,
        lastSeenMs: 2,
        minGapMs: 1,
        risk: { score: 10, flags: ['hub_activity'] },
        manualLabel: null,
      },
    ]);
    expect(layout[nodeA]).toBeDefined();
    expect(layout[nodeB]).toBeDefined();

    const path = findShortestPath(nodeA, nodeC, [
      {
        id: 'a-b',
        source: nodeA,
        target: nodeB,
        count: 1,
        variants: ['Asset'],
        assetIds: [],
        latestSeenMs: 1,
      },
      {
        id: 'b-c',
        source: nodeB,
        target: nodeC,
        count: 1,
        variants: ['Asset'],
        assetIds: [],
        latestSeenMs: 1,
      },
    ]);
    expect(path).toEqual([nodeA, nodeB, nodeC]);
  });

  it('builds csv output and parses/stringifies trace bundles', () => {
    const nodeA = SAMPLE_I105;
    const nodeB = SAMPLE_I105_ALT;

    const nodes = [
      {
        id: nodeA,
        depth: 0,
        inDegree: 0,
        outDegree: 1,
        eventCount: 1,
        firstSeenMs: 1,
        lastSeenMs: 1,
        minGapMs: null,
        risk: { score: 0, flags: [] },
        manualLabel: null,
      },
    ];
    const edges = [
      {
        id: 'e1',
        source: nodeA,
        target: nodeB,
        count: 1,
        variants: ['Asset'],
        assetIds: [],
        latestSeenMs: 1,
      },
    ];
    const events = [
      {
        id: 'ev1',
        source: nodeA,
        target: nodeB,
        variant: 'Asset',
        assetId: null,
        authority: nodeA,
        transactionHash: 'ab'.repeat(32),
        instructionIndex: 0,
        transactionStatus: 'Committed' as const,
        block: 1,
        createdAtMs: 1,
      },
    ];
    const csv = buildTraceCsv(nodes, edges, events);
    expect(csv.nodes).toContain('id,depth,in_degree');
    expect(csv.edges).toContain('source,target');
    expect(csv.events).toContain('transaction_hash');

    const bundle: TraceBundle = {
      format: 'iroha-trace-bundle',
      version: 2,
      exported_at: '2026-02-26T00:00:00.000Z',
      torii_base_url: 'https://torii.example',
      seed: { type: 'account', value: nodeA },
      filters: { committed_only: true, transfer_variants: 'all' },
      graph: { nodes, edges, events },
      cursors: [
        {
          accountId: nodeA,
          depth: 0,
          block: 100,
          cursor: 'opaque-cursor',
          visitedCursors: ['opaque-cursor'],
          exhausted: false,
        },
      ],
      labels: {},
      csv,
    };
    const raw = stringifyTraceBundle(bundle);
    const parsed = parseTraceBundle(JSON.parse(raw));
    expect(parsed.seed.value).toBe(nodeA);
    expect(parsed.graph.nodes).toHaveLength(1);
    expect(parsed.cursors[0]?.cursor).toBe('opaque-cursor');
    expect(() => parseTraceBundle({ ...JSON.parse(raw), version: 1 })).toThrow();
    expect(() =>
      parseTraceBundle({
        ...bundle,
        seed: { type: 'account', value: SAMPLE_ACCOUNT_ALIAS },
      })
    ).toThrow();
    expect(() =>
      parseTraceBundle({
        ...bundle,
        seed: { type: 'transaction', value: '0xabc' },
      })
    ).toThrow();
  });
});
