import { describe, expect, it } from 'vitest';
import type { KotodamaStudioDocument } from './kotodama-studio-document';
import {
  getNextKotodamaStudioWorkflowNodeId,
  getNextKotodamaStudioWorkflowNodePosition,
  isValidKotodamaStudioWorkflowConnection,
  reconcileKotodamaStudioWorkflowBindings,
  sanitizeKotodamaStudioWorkflow,
} from './kotodama-studio-workflow';

function createWorkflow(
  overrides: Partial<KotodamaStudioDocument['workflow']> = {}
): KotodamaStudioDocument['workflow'] {
  return {
    nodes: [
      {
        id: 'trigger-1',
        type: 'studio',
        position: { x: 80, y: 80 },
        data: {
          title: 'Start',
          caption: 'Kick off the flow.',
          category: 'trigger',
          binding: null,
          config: {},
        },
      },
      {
        id: 'contract-1',
        type: 'studio',
        position: { x: 320, y: 80 },
        data: {
          title: 'Call contract',
          caption: 'Run the entrypoint.',
          category: 'contract',
          binding: 'celebrate',
          config: {},
        },
      },
      {
        id: 'output-1',
        type: 'studio',
        position: { x: 560, y: 80 },
        data: {
          title: 'Show result',
          caption: 'Render output.',
          category: 'output',
          binding: null,
          config: {},
        },
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe('kotodama studio workflow rules', () => {
  it('allocates the next readable node id from the highest category suffix', () => {
    const workflow = createWorkflow({
      nodes: [
        ...createWorkflow().nodes,
        {
          id: 'contract-7',
          type: 'studio',
          position: { x: 320, y: 240 },
          data: {
            title: 'Later contract',
            caption: 'Run after a gap.',
            category: 'contract',
            binding: null,
            config: {},
          },
        },
        {
          id: 'contract-custom',
          type: 'studio',
          position: { x: 320, y: 400 },
          data: {
            title: 'Custom contract',
            caption: 'Does not affect numeric allocation.',
            category: 'contract',
            binding: null,
            config: {},
          },
        },
      ],
    });

    expect(getNextKotodamaStudioWorkflowNodeId(workflow, 'contract')).toBe('contract-8');
    expect(getNextKotodamaStudioWorkflowNodeId(workflow, 'logic')).toBe('logic-1');
  });

  it('places new workflow nodes into the first open grid slot instead of reusing an occupied one', () => {
    const workflow = createWorkflow({
      nodes: [
        {
          ...createWorkflow().nodes[0]!,
          position: { x: 80, y: 80 },
        },
        {
          ...createWorkflow().nodes[1]!,
          position: { x: 720, y: 80 },
        },
        {
          ...createWorkflow().nodes[2]!,
          position: { x: 80, y: 300 },
        },
      ],
    });

    expect(getNextKotodamaStudioWorkflowNodePosition(workflow, {
      originX: 80,
      originY: 80,
      columnSpacing: 320,
      rowSpacing: 220,
      columns: 3,
    })).toEqual({
      x: 400,
      y: 80,
    });
  });

  it('accepts a structurally valid workflow connection', () => {
    expect(isValidKotodamaStudioWorkflowConnection(createWorkflow(), {
      source: 'trigger-1',
      target: 'contract-1',
    })).toBe(true);
  });

  it('rejects invalid workflow connections that target trigger nodes or self-loop', () => {
    expect(isValidKotodamaStudioWorkflowConnection(createWorkflow(), {
      source: 'output-1',
      target: 'trigger-1',
    })).toBe(false);
    expect(isValidKotodamaStudioWorkflowConnection(createWorkflow(), {
      source: 'contract-1',
      target: 'contract-1',
    })).toBe(false);
  });

  it('drops dangling, duplicate, and over-capacity edges during sanitization', () => {
    const workflow = createWorkflow({
      edges: [
        { id: 'edge-trigger-contract', source: 'trigger-1', target: 'contract-1', label: '' },
        { id: 'edge-trigger-contract-dup', source: 'trigger-1', target: 'contract-1', label: '' },
        { id: 'edge-missing-output', source: 'missing-node', target: 'output-1', label: '' },
        { id: 'edge-contract-output', source: 'contract-1', target: 'output-1', label: '' },
      ],
    });

    const sanitized = sanitizeKotodamaStudioWorkflow(workflow);

    expect(sanitized.workflow.edges).toEqual([
      { id: 'edge-trigger-contract', source: 'trigger-1', target: 'contract-1', label: '' },
      { id: 'edge-contract-output', source: 'contract-1', target: 'output-1', label: '' },
    ]);
    expect(sanitized.droppedEdgeCount).toBe(2);
  });

  it('drops edges that violate per-category capacity rules during sanitization', () => {
    const workflow = createWorkflow({
      nodes: [
        ...createWorkflow().nodes,
        {
          id: 'logic-1',
          type: 'studio',
          position: { x: 780, y: 80 },
          data: {
            title: 'Branch',
            caption: 'Make a choice.',
            category: 'logic',
            binding: null,
            config: {},
          },
        },
      ],
      edges: [
        { id: 'edge-trigger-contract', source: 'trigger-1', target: 'contract-1', label: '' },
        { id: 'edge-trigger-logic', source: 'trigger-1', target: 'logic-1', label: '' },
      ],
    });

    const sanitized = sanitizeKotodamaStudioWorkflow(workflow);

    expect(sanitized.workflow.edges).toEqual([
      { id: 'edge-trigger-contract', source: 'trigger-1', target: 'contract-1', label: '' },
    ]);
    expect(sanitized.droppedEdgeCount).toBe(1);
  });

  it('clears stale contract bindings while keeping valid ones intact', () => {
    const workflow = createWorkflow({
      nodes: [
        ...createWorkflow().nodes,
        {
          id: 'contract-2',
          type: 'studio',
          position: { x: 320, y: 240 },
          data: {
            title: 'Second contract',
            caption: 'Another call.',
            category: 'contract',
            binding: 'bill',
            config: {},
          },
        },
      ],
    });

    const reconciled = reconcileKotodamaStudioWorkflowBindings(workflow, ['celebrate']);

    expect(reconciled.workflow.nodes.find((node) => node.id === 'contract-1')?.data.binding).toBe('celebrate');
    expect(reconciled.workflow.nodes.find((node) => node.id === 'contract-2')?.data.binding).toBeNull();
    expect(reconciled.clearedBindingCount).toBe(1);
  });
});
