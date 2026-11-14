import { describe, expect, it } from 'vitest';
import {
  buildKotodamaStudioGraphSource,
  cloneKotodamaStudioGraphDocument,
  createKotodamaStudioGraphNode,
  createKotodamaStudioGraphTemplate,
  findKotodamaStudioGraphNodeForLine,
  normalizeKotodamaStudioGraphDocument,
  parseKotodamaStudioGraphDocument,
  refreshKotodamaStudioGraphPorts,
  stringifyKotodamaStudioGraphDocument,
  validateKotodamaStudioGraphDocument,
} from './kotodama-studio-graph';

describe('kotodama studio graph documents', () => {
  it('generates deployable source and node ranges from a stablecoin graph', () => {
    const document = createKotodamaStudioGraphTemplate('stablecoin', (key) => (
      key === 'studio.graph.templateNodes.stablecoin.ratio_ok.failureMessage'
        ? 'insufficient collateral'
        : key
    ));
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

  it.each([
    { name: 'version 1', payload: { version: 1, metadata: {}, workflow: { nodes: [] } } },
    { name: 'an unversioned document', payload: { metadata: {}, graph: { nodes: [], edges: [] } } },
  ])('rejects $name instead of applying a compatibility conversion', ({ payload }) => {
    expect(() => normalizeKotodamaStudioGraphDocument(payload)).toThrow('Studio graph document must use version 2');
  });

  it.each([
    {
      name: 'missing metadata',
      corrupt(document: ReturnType<typeof createKotodamaStudioGraphTemplate>) {
        return { ...document, metadata: undefined };
      },
      error: /missing required fields: metadata/u,
    },
    {
      name: 'non-array nodes',
      corrupt(document: ReturnType<typeof createKotodamaStudioGraphTemplate>) {
        return { ...document, graph: { ...document.graph, nodes: {} } };
      },
      error: /graph\.nodes must be an array/u,
    },
    {
      name: 'missing edges',
      corrupt(document: ReturnType<typeof createKotodamaStudioGraphTemplate>) {
        return { ...document, graph: { nodes: document.graph.nodes } };
      },
      error: /graph is missing required fields: edges/u,
    },
  ])('strictly rejects a v2 document with $name', ({ corrupt, error }) => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    expect(() => parseKotodamaStudioGraphDocument(JSON.stringify(corrupt(document)))).toThrow(error);
  });

  it.each([
    {
      name: 'an unsupported node kind',
      corrupt(node: ReturnType<typeof createKotodamaStudioGraphTemplate>['graph']['nodes'][number]) {
        return { ...node, data: { ...node.data, kind: 'legacy_contract' } };
      },
      error: /graph\.nodes\[0\]\.data\.kind is unsupported/u,
    },
    {
      name: 'a config value that the old normalizer would coerce',
      corrupt(node: ReturnType<typeof createKotodamaStudioGraphTemplate>['graph']['nodes'][number]) {
        return { ...node, data: { ...node.data, config: { ...node.data.config, name: 42 } } };
      },
      error: /graph\.nodes\[0\]\.data\.config\.name must be a string/u,
    },
    {
      name: 'a non-finite position encoded as a string',
      corrupt(node: ReturnType<typeof createKotodamaStudioGraphTemplate>['graph']['nodes'][number]) {
        return { ...node, position: { ...node.position, x: 'NaN' } };
      },
      error: /graph\.nodes\[0\]\.position\.x must be finite/u,
    },
  ])('strictly rejects $name instead of repairing the node', ({ corrupt, error }) => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    const payload = {
      ...document,
      graph: {
        ...document.graph,
        nodes: [corrupt(document.graph.nodes[0]!), ...document.graph.nodes.slice(1)],
      },
    };
    expect(() => parseKotodamaStudioGraphDocument(JSON.stringify(payload))).toThrow(error);
  });

  it.each([
    {
      name: 'an incomplete edge shape',
      edge: { id: 'edge-corrupt', source: 'entry-mintable', label: 'next' },
      error: /graph\.edges\[0\] is missing required fields: target/u,
    },
    {
      name: 'a dangling source that the old normalizer would drop',
      edge: { id: 'edge-corrupt', source: 'missing-node', target: 'value', label: 'next' },
      error: /graph\.edges\[0\]\.source references unknown node: missing-node/u,
    },
  ])('strictly rejects $name instead of losing the edge', ({ edge, error }) => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    const payload = { ...document, graph: { ...document.graph, edges: [edge] } };
    expect(() => parseKotodamaStudioGraphDocument(JSON.stringify(payload))).toThrow(error);
  });

  it('rejects duplicate node identities instead of accepting ambiguous edge bindings', () => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    const duplicate = {
      ...document.graph.nodes[1]!,
      id: document.graph.nodes[0]!.id,
    };
    const payload = {
      ...document,
      graph: {
        ...document.graph,
        nodes: [document.graph.nodes[0]!, duplicate, ...document.graph.nodes.slice(2)],
      },
    };

    expect(() => parseKotodamaStudioGraphDocument(JSON.stringify(payload))).toThrow(
      /graph\.nodes contains duplicate id/u
    );
  });

  it('keeps derived-port repair in the editor normalizer', () => {
    const document = createKotodamaStudioGraphTemplate('stablecoin');
    const firstNode = document.graph.nodes[0]!;
    const normalized = normalizeKotodamaStudioGraphDocument({
      ...document,
      graph: {
        ...document.graph,
        nodes: [{ ...firstNode, data: { ...firstNode.data, ports: [] } }, ...document.graph.nodes.slice(1)],
      },
    });

    expect(normalized.graph.nodes[0]?.data.ports.length).toBeGreaterThan(0);
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
    'generates a valid branded %s graph for canonical Rust service compilation',
    (templateId) => {
      const document = createKotodamaStudioGraphTemplate(templateId);
      const output = buildKotodamaStudioGraphSource(document);

      expect(validateKotodamaStudioGraphDocument(document)).toEqual([]);
      expect(output.source).toMatch(/(?:^|\n)seiyaku\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/u);
      expect(output.summary.entrypoints.length).toBeGreaterThan(0);
      for (const entrypoint of output.summary.entrypoints) {
        expect(output.source).toContain(`${entrypoint.kind} fn ${entrypoint.name}`);
      }
    }
  );

  it('round-trips an exact v2 graph document through strict JSON import', () => {
    const document = createKotodamaStudioGraphTemplate('asset_ops');
    const normalized = parseKotodamaStudioGraphDocument(stringifyKotodamaStudioGraphDocument(document));

    expect(normalized).toEqual(document);
  });
});
