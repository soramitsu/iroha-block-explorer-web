import { describe, expect, it } from 'vitest';
import { createEmptyKotodamaStudioDocument } from './kotodama-studio-document';
import { buildKotodamaStudioSemanticDiagnostics } from './kotodama-studio-semantics';

describe('buildKotodamaStudioSemanticDiagnostics', () => {
  it('passes through Blockly workspace issues', () => {
    const document = createEmptyKotodamaStudioDocument();

    const diagnostics = buildKotodamaStudioSemanticDiagnostics({
      document,
      summary: {
        states: [],
        entrypoints: [],
        triggers: [],
      },
      workspaceIssues: [{
        code: 'duplicate_state',
        severity: 'error',
        message: 'State `points` is defined more than once.',
      }],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate_state',
          target: {
            type: 'workspace',
            id: null,
          },
        }),
      ])
    );
  });

  it('reports missing public entrypoints and invalid contract bindings', () => {
    const document = createEmptyKotodamaStudioDocument();
    document.workflow.nodes = [{
      id: 'contract-1',
      type: 'studio',
      position: { x: 80, y: 80 },
      data: {
        title: 'Call rewards',
        caption: 'Invoke the reward entrypoint.',
        category: 'contract',
        binding: 'celebrate',
        config: {
          action: 'call',
        },
      },
    }];

    const diagnostics = buildKotodamaStudioSemanticDiagnostics({
      document,
      summary: {
        states: [],
        entrypoints: [{
          name: 'boot',
          kind: 'hajimari',
          permission: null,
        }],
        triggers: [],
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_public_entrypoint', severity: 'error' }),
        expect.objectContaining({ code: 'contract_invalid_binding', severity: 'error' }),
      ])
    );
  });

  it('reports unreachable workflow steps and missing node config', () => {
    const document = createEmptyKotodamaStudioDocument();
    document.workflow.nodes = [
      {
        id: 'trigger-1',
        type: 'studio',
        position: { x: 80, y: 80 },
        data: {
          title: 'Heartbeat',
          caption: 'Kick off the path.',
          category: 'trigger',
          binding: null,
          config: {
            mode: 'pre_commit',
          },
        },
      },
      {
        id: 'data-1',
        type: 'studio',
        position: { x: 320, y: 80 },
        data: {
          title: 'Load telemetry',
          caption: 'Read explorer data.',
          category: 'data',
          binding: null,
          config: {},
        },
      },
    ];

    const diagnostics = buildKotodamaStudioSemanticDiagnostics({
      document,
      summary: {
        states: [],
        entrypoints: [{
          name: 'celebrate',
          kind: 'kotoage',
          permission: 'Builder',
        }],
        triggers: [],
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'trigger_without_path', severity: 'warning' }),
        expect.objectContaining({ code: 'workflow_unreachable_node', severity: 'warning' }),
        expect.objectContaining({ code: 'data_missing_source', severity: 'warning' }),
      ])
    );
  });

  it('requires valid schedule config and distinct branch labels on logic steps', () => {
    const document = createEmptyKotodamaStudioDocument();
    document.workflow.nodes = [
      {
        id: 'trigger-1',
        type: 'studio',
        position: { x: 80, y: 80 },
        data: {
          title: 'Every hour',
          caption: 'Scheduled trigger.',
          category: 'trigger',
          binding: null,
          config: {
            mode: 'schedule',
            scheduleStartMs: '-1',
            schedulePeriodMs: '0',
          },
        },
      },
      {
        id: 'logic-1',
        type: 'studio',
        position: { x: 320, y: 80 },
        data: {
          title: 'Should branch',
          caption: 'Choose a path.',
          category: 'logic',
          binding: null,
          config: {
            condition: 'alerts > 3',
          },
        },
      },
      {
        id: 'output-1',
        type: 'studio',
        position: { x: 560, y: 40 },
        data: {
          title: 'Warn operator',
          caption: 'Surface a warning.',
          category: 'output',
          binding: null,
          config: {
            channel: 'notification',
          },
        },
      },
      {
        id: 'output-2',
        type: 'studio',
        position: { x: 560, y: 160 },
        data: {
          title: 'Stay quiet',
          caption: 'No action needed.',
          category: 'output',
          binding: null,
          config: {
            channel: 'dashboard',
          },
        },
      },
    ];
    document.workflow.edges = [
      { id: 'edge-trigger-logic', source: 'trigger-1', target: 'logic-1', label: '' },
      { id: 'edge-logic-output-1', source: 'logic-1', target: 'output-1', label: 'yes' },
      { id: 'edge-logic-output-2', source: 'logic-1', target: 'output-2', label: 'yes' },
    ];

    const diagnostics = buildKotodamaStudioSemanticDiagnostics({
      document,
      summary: {
        states: [],
        entrypoints: [{
          name: 'celebrate',
          kind: 'kotoage',
          permission: 'Builder',
        }],
        triggers: [],
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'trigger_invalid_schedule_start', severity: 'error' }),
        expect.objectContaining({ code: 'trigger_invalid_schedule_period', severity: 'error' }),
        expect.objectContaining({ code: 'logic_duplicate_edge_labels', severity: 'warning' }),
      ])
    );
  });
});
