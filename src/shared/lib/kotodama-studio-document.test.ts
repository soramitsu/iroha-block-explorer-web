import { describe, expect, it } from 'vitest';
import { parseKotodamaStudioDocumentWithDiagnostics } from './kotodama-studio-document';

describe('kotodama studio document normalization', () => {
  it('reports how many invalid workflow edges were dropped while parsing', () => {
    const parsed = parseKotodamaStudioDocumentWithDiagnostics(JSON.stringify({
      version: 1,
      updatedAt: '2026-03-29T00:00:00.000Z',
      metadata: {
        title: 'RewardGarden',
        dataspace: 'party',
        authority: 'host@party.main',
        chainId: 'wonderland',
        description: 'Celebrate good actions.',
      },
      workspaceState: null,
      workflow: {
        nodes: [
          {
            id: 'trigger-1',
            type: 'studio',
            position: { x: 80, y: 80 },
            data: {
              title: 'Friend joins',
              caption: 'Start the flow.',
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
              caption: 'Run celebrate.',
              category: 'contract',
              binding: 'celebrate',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'edge-valid', source: 'trigger-1', target: 'contract-1', label: '' },
          { id: 'edge-invalid', source: 'trigger-1', target: 'missing-node', label: '' },
        ],
      },
    }));

    expect(parsed.document.workflow.edges).toEqual([
      { id: 'edge-valid', source: 'trigger-1', target: 'contract-1', label: '' },
    ]);
    expect(parsed.document.metadata.dataspace).toBe('party');
    expect(parsed.droppedWorkflowEdgeCount).toBe(1);
  });

  it('preserves explicit dataspace metadata when a newer studio document provides it', () => {
    const parsed = parseKotodamaStudioDocumentWithDiagnostics(JSON.stringify({
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
      metadata: {
        title: 'RewardGarden',
        dataspace: 'governance',
        authority: 'host@party.main',
        chainId: 'wonderland',
        description: 'Celebrate good actions.',
      },
      workspaceState: null,
      workflow: {
        nodes: [],
        edges: [],
      },
    }));

    expect(parsed.document.metadata.dataspace).toBe('governance');
    expect(parsed.document.metadata).not.toHaveProperty('namespace');
    expect(parsed.document.metadata).not.toHaveProperty('contractId');
  });

  it('drops legacy namespace-only deploy metadata instead of mapping it into dataspace', () => {
    const parsed = parseKotodamaStudioDocumentWithDiagnostics(JSON.stringify({
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
      metadata: {
        title: 'RewardGarden',
        namespace: 'party',
        contractId: 'reward-garden',
        authority: 'host@party.main',
        chainId: 'wonderland',
        description: 'Celebrate good actions.',
      },
      workspaceState: null,
      workflow: {
        nodes: [],
        edges: [],
      },
    }));

    expect(parsed.document.metadata.dataspace).toBe('universal');
    expect(parsed.document.metadata).not.toHaveProperty('namespace');
    expect(parsed.document.metadata).not.toHaveProperty('contractId');
  });
});
