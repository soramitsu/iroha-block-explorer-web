import { describe, expect, it } from 'vitest';
import { compileKotodamaStudioSource } from './kotodama-studio-deploy';
import {
  buildKotodamaStudioGraphSource,
  cloneKotodamaStudioGraphDocument,
  createKotodamaStudioGraphNode,
  createKotodamaStudioGraphTemplate,
  findKotodamaStudioGraphNodeForLine,
  normalizeKotodamaStudioGraphDocument,
  refreshKotodamaStudioGraphPorts,
  stringifyKotodamaStudioGraphDocument,
  validateKotodamaStudioGraphDocument,
} from './kotodama-studio-graph';

describe('kotodama studio graph documents', () => {
  it('generates deployable source and node ranges from a stablecoin graph', () => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    const output = buildKotodamaStudioGraphSource(document);

    expect(output.source).toContain('seiyaku StablecoinSimple');
    expect(output.source).toContain('kotoage fn mintable_amount(collateral_amount: int, price: int, target_ratio_bps: int) -> int');
    expect(output.source).toContain('assert(post_ratio >= min_ratio_bps, "insufficient collateral");');
    expect(output.summary.entrypoints.map((entrypoint) => entrypoint.name)).toEqual(['mintable_amount', 'mint_stable']);

    const mintEntrypoint = document.graph.nodes.find((node) => node.id === 'entry-mint-stable');
    expect(mintEntrypoint?.data.ports).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'param-user', direction: 'output', valueType: 'AccountId' }),
      expect.objectContaining({ id: 'param-collateral_asset', direction: 'output', valueType: 'AssetDefinitionId' }),
      expect.objectContaining({ id: 'param-mint_amount', direction: 'output', valueType: 'int' }),
    ]));

    const moveCollateral = document.graph.nodes.find((node) => node.id === 'move-collateral');
    expect(moveCollateral?.data.config).toEqual(expect.objectContaining({
      from: 'user',
      to: 'vault_account',
      assetDefinition: 'collateral_asset',
      amount: 'collateral_amount',
    }));
    expect(moveCollateral?.data.ports).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'arg-1', direction: 'input', valueType: 'AccountId' }),
      expect.objectContaining({ id: 'arg-3', direction: 'input', valueType: 'AssetDefinitionId' }),
      expect.objectContaining({ id: 'arg-4', direction: 'input', valueType: 'int' }),
    ]));

    const ratioRange = output.ranges.find((range) => range.nodeId === 'ratio-ok');
    expect(ratioRange).toEqual(expect.objectContaining({
      nodeId: 'ratio-ok',
      startLine: expect.any(Number),
      endLine: expect.any(Number),
    }));
    expect(findKotodamaStudioGraphNodeForLine(output.ranges, ratioRange?.startLine)).toBe('ratio-ok');
  });

  it('normalizes legacy v1 workflow documents into a graph-first document', () => {
    const document = normalizeKotodamaStudioGraphDocument({
      version: 1,
      updatedAt: '2026-04-24T00:00:00.000Z',
      metadata: {
        title: 'LegacyContract',
        dataspace: 'legacy',
        authority: 'builder@legacy.main',
      chainId: 'wonderland',
      description: 'Imported from the storyboard editor.',
    },
      workspaceState: {
        blocks: {
          languageVersion: 0,
          blocks: [{ type: 'studio_contract', id: 'legacy-block' }],
        },
      },
      workflow: {
        nodes: [
          {
            id: 'trigger-legacy',
            position: { x: 20, y: 30 },
            data: {
              title: 'Every block',
              category: 'trigger',
              binding: 'ship',
            },
          },
          {
            id: 'contract-legacy',
            position: { x: 220, y: 30 },
            data: {
              title: 'Ship reward',
              caption: 'Old contract card',
              category: 'contract',
              binding: 'ship',
            },
          },
        ],
      },
    });

    expect(document.version).toBe(2);
    expect(document.metadata).toEqual(expect.objectContaining({
      title: 'LegacyContract',
      dataspace: 'legacy',
      authority: 'builder@legacy.main',
    }));
    expect(document.graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'entry-legacy',
        data: expect.objectContaining({
          kind: 'entrypoint',
          config: expect.objectContaining({ name: 'ship' }),
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'trigger',
          config: expect.objectContaining({ entrypoint: 'ship' }),
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'effect',
          config: expect.objectContaining({ effect: 'info' }),
        }),
      }),
    ]));
    expect(document.graph.edges[0]).toEqual(expect.objectContaining({
      source: 'entry-legacy',
      target: 'legacy-note-2',
    }));
    expect(document.legacy).toEqual(expect.objectContaining({
      sourceVersion: 1,
      workspaceState: expect.objectContaining({
        blocks: expect.objectContaining({
          blocks: [expect.objectContaining({ id: 'legacy-block' })],
        }),
      }),
      workflow: expect.objectContaining({
        nodes: expect.any(Array),
      }),
      notes: expect.arrayContaining([
        expect.stringContaining('Original Blockly workspace'),
        expect.stringContaining('workflow intent'),
      ]),
    }));
  });

  it('validates duplicate declarations, broken trigger targets, and stale edges', () => {
    const document = cloneKotodamaStudioGraphDocument(createKotodamaStudioGraphTemplate('stablecoin'));
    document.graph.nodes.push(createKotodamaStudioGraphNode('state', 1, { x: 10, y: 10 }));
    document.graph.nodes.push({
      ...createKotodamaStudioGraphNode('state', 2, { x: 20, y: 20 }),
      data: {
        ...createKotodamaStudioGraphNode('state', 2, { x: 20, y: 20 }).data,
        config: {
          name: 'counter',
          valueType: 'int',
        },
      },
    });
    document.graph.nodes.push({
      ...createKotodamaStudioGraphNode('trigger', 1, { x: 30, y: 30 }),
      id: 'trigger-broken',
      data: {
        ...createKotodamaStudioGraphNode('trigger', 1, { x: 30, y: 30 }).data,
        config: {
          id: 'broken',
          entrypoint: 'missing',
          mode: 'schedule',
          startMs: '0',
          periodMs: '0',
        },
      },
    });
    document.graph.edges.push({
      id: 'edge-stale',
      source: 'entry-mintable',
      target: 'missing-node',
      label: 'next',
    });

    expect(validateKotodamaStudioGraphDocument(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_state', nodeId: 'state-1' }),
      expect.objectContaining({ code: 'duplicate_state', nodeId: 'state-2' }),
      expect.objectContaining({ code: 'trigger_invalid_entrypoint', nodeId: 'trigger-broken' }),
      expect.objectContaining({ code: 'trigger_invalid_period', nodeId: 'trigger-broken' }),
      expect.objectContaining({ code: 'invalid_edge', nodeId: null }),
    ]));
  });

  it('validates field-level value types and duplicate branch flow labels', () => {
    const state = createKotodamaStudioGraphNode('state', 1, { x: 80, y: 40 });
    state.id = 'state-counter';
    state.data.config = { ...state.data.config, name: 'counter', valueType: 'int' };

    const mapState = createKotodamaStudioGraphNode('map_state', 1, { x: 300, y: 40 });
    mapState.id = 'map-scores';
    mapState.data.config = { ...mapState.data.config, name: 'Scores', keyType: 'Name', valueType: 'int' };

    const entry = createKotodamaStudioGraphNode('entrypoint', 1, { x: 80, y: 220 });
    entry.id = 'entry-run';
    entry.data.config = { ...entry.data.config, name: 'run', params: '', returnType: '' };

    const assign = createKotodamaStudioGraphNode('assign_state', 1, { x: 340, y: 220 });
    assign.id = 'assign-counter';
    assign.data.config = { ...assign.data.config, target: 'counter', value: 'authority()' };

    const mapWrite = createKotodamaStudioGraphNode('map_write', 1, { x: 600, y: 220 });
    mapWrite.id = 'write-score';
    mapWrite.data.config = { ...mapWrite.data.config, target: 'Scores', key: '1', value: 'authority()' };

    const branch = createKotodamaStudioGraphNode('branch', 1, { x: 860, y: 220 });
    branch.id = 'branch-duplicate';
    branch.data.config = { ...branch.data.config, condition: 'true' };

    const thenEffect = createKotodamaStudioGraphNode('effect', 1, { x: 1120, y: 140 });
    thenEffect.id = 'effect-then';
    const duplicateThenEffect = createKotodamaStudioGraphNode('effect', 2, { x: 1120, y: 300 });
    duplicateThenEffect.id = 'effect-duplicate-then';

    const document = refreshKotodamaStudioGraphPorts({
      version: 2,
      updatedAt: '2026-04-24T00:00:00.000Z',
      metadata: {
        title: 'TypedValidation',
        dataspace: 'validation',
        authority: 'operator@validation.main',
        chainId: 'wonderland',
        description: 'Typed validation fixture.',
      },
      legacy: null,
      graph: {
        nodes: [state, mapState, entry, assign, mapWrite, branch, thenEffect, duplicateThenEffect],
        edges: [
          { id: 'edge-entry-assign-next', source: 'entry-run', target: 'assign-counter', label: 'next' },
          { id: 'edge-assign-write-next', source: 'assign-counter', target: 'write-score', label: 'next' },
          { id: 'edge-write-branch-next', source: 'write-score', target: 'branch-duplicate', label: 'next' },
          { id: 'edge-branch-then', source: 'branch-duplicate', target: 'effect-then', label: 'then' },
          { id: 'edge-branch-duplicate-then', source: 'branch-duplicate', target: 'effect-duplicate-then', label: 'then' },
        ],
      },
    });

    const diagnostics = validateKotodamaStudioGraphDocument(document);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'state_value_type_mismatch', nodeId: 'assign-counter', field: 'value' }),
      expect.objectContaining({ code: 'map_key_type_mismatch', nodeId: 'write-score', field: 'key' }),
      expect.objectContaining({ code: 'map_value_type_mismatch', nodeId: 'write-score', field: 'value' }),
      expect.objectContaining({ code: 'invalid_connection', nodeId: 'branch-duplicate' }),
    ]));
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'invalid_connection')).toHaveLength(2);
  });

  it.each(['stablecoin', 'asset_ops', 'threshold_escrow', 'subscription', 'irohaswap_reduced'] as const)(
    'compiles the generated %s graph through the browser compiler',
    async (templateId) => {
      const output = buildKotodamaStudioGraphSource(createKotodamaStudioGraphTemplate(templateId));
      const result = await compileKotodamaStudioSource({
        source: output.source,
        summary: output.summary,
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.codeHashHex).toHaveLength(64);
      expect(result.manifest?.entrypoints.length).toBe(output.summary.entrypoints.length);
    }
  );

  it('round-trips v2 graph documents through JSON normalization', () => {
    const document = createKotodamaStudioGraphTemplate('asset_ops');
    const normalized = normalizeKotodamaStudioGraphDocument(JSON.parse(stringifyKotodamaStudioGraphDocument(document)));

    expect(normalized).toEqual(document);
  });
});
