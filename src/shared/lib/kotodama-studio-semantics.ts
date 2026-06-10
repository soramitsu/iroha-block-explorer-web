import type { KotodamaStudioDocument, KotodamaStudioWorkflowNode } from './kotodama-studio-document';
import type { KotodamaStudioWorkspaceSummary } from './kotodama-studio-source';

export interface KotodamaStudioSemanticDiagnostic {
  code: string
  severity: 'error' | 'warning'
  message: string
  target: {
    type: 'workspace' | 'node' | 'edge' | 'workflow'
    id: string | null
  }
}

export interface KotodamaStudioWorkspaceSemanticIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export interface KotodamaStudioSemanticInput {
  document: KotodamaStudioDocument
  summary: KotodamaStudioWorkspaceSummary
  workspaceIssues?: KotodamaStudioWorkspaceSemanticIssue[]
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function publicEntrypointNames(summary: KotodamaStudioWorkspaceSummary): string[] {
  return uniqueValues(
    summary.entrypoints
      .filter((entrypoint) => entrypoint.kind === 'kotoage')
      .map((entrypoint) => entrypoint.name)
  );
}

function parseWholeNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function pushNodeDiagnostic(
  diagnostics: KotodamaStudioSemanticDiagnostic[],
  node: KotodamaStudioWorkflowNode,
  severity: KotodamaStudioSemanticDiagnostic['severity'],
  code: string,
  message: string
) {
  diagnostics.push({
    code,
    severity,
    message,
    target: {
      type: 'node',
      id: node.id,
    },
  });
}

export function buildKotodamaStudioSemanticDiagnostics(
  input: KotodamaStudioSemanticInput
): KotodamaStudioSemanticDiagnostic[] {
  const diagnostics: KotodamaStudioSemanticDiagnostic[] = (input.workspaceIssues ?? []).map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    target: {
      type: 'workspace',
      id: null,
    },
  }));

  const workflow = input.document.workflow;
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node] as const));
  const publicEntrypoints = new Set(publicEntrypointNames(input.summary));
  const incomingCount = new Map<string, number>();
  const outgoingEdges = new Map<string, typeof workflow.edges>();

  for (const node of workflow.nodes) {
    incomingCount.set(node.id, 0);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of workflow.edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    const currentOutgoing = outgoingEdges.get(edge.source) ?? [];
    currentOutgoing.push(edge);
    outgoingEdges.set(edge.source, currentOutgoing);
  }

  const reachableNodeIds = new Set<string>();
  const traversalQueue = workflow.nodes
    .filter((node) => node.data.category === 'trigger')
    .map((node) => node.id);

  while (traversalQueue.length > 0) {
    const currentId = traversalQueue.shift()!;
    if (reachableNodeIds.has(currentId)) continue;
    reachableNodeIds.add(currentId);
    for (const edge of outgoingEdges.get(currentId) ?? []) {
      if (!reachableNodeIds.has(edge.target)) {
        traversalQueue.push(edge.target);
      }
    }
  }

  if (publicEntrypoints.size === 0) {
    diagnostics.push({
      code: 'missing_public_entrypoint',
      severity: 'error',
      message: 'Add at least one public entrypoint before compiling or wiring workflow contract calls.',
      target: {
        type: 'workspace',
        id: null,
      },
    });
  }

  for (const node of workflow.nodes) {
    const incoming = incomingCount.get(node.id) ?? 0;
    const outgoing = outgoingEdges.get(node.id) ?? [];

    if (node.data.category !== 'trigger' && !reachableNodeIds.has(node.id)) {
      pushNodeDiagnostic(
        diagnostics,
        node,
        'warning',
        'workflow_unreachable_node',
        `Workflow step "${node.data.title}" is not reachable from any trigger.`
      );
    }

    if (node.data.category === 'trigger') {
      const mode = node.data.config.mode ?? 'pre_commit';
      if (outgoing.length === 0) {
        pushNodeDiagnostic(
          diagnostics,
          node,
          'warning',
          'trigger_without_path',
          `Trigger "${node.data.title}" does not lead to another workflow step.`
        );
      }

      if (mode === 'schedule') {
        const startMs = parseWholeNumber(node.data.config.scheduleStartMs);
        const periodMs = parseWholeNumber(node.data.config.schedulePeriodMs);

        if (startMs === null || startMs < 0) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'error',
            'trigger_invalid_schedule_start',
            `Scheduled trigger "${node.data.title}" needs a non-negative start time in milliseconds.`
          );
        }

        if (periodMs === null || periodMs <= 0) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'error',
            'trigger_invalid_schedule_period',
            `Scheduled trigger "${node.data.title}" needs a positive repeat interval in milliseconds.`
          );
        }
      }
    }

    if (node.data.category === 'data' && !(node.data.config.source ?? '').trim()) {
      pushNodeDiagnostic(
        diagnostics,
        node,
        'warning',
        'data_missing_source',
        `Data step "${node.data.title}" should declare which explorer feed it reads from.`
      );
    }

    if (node.data.category === 'logic') {
      if (!(node.data.config.condition ?? '').trim()) {
        pushNodeDiagnostic(
          diagnostics,
          node,
          'warning',
          'logic_missing_condition',
          `Logic step "${node.data.title}" should describe its branch condition.`
        );
      }

      if (outgoing.length === 0) {
        pushNodeDiagnostic(
          diagnostics,
          node,
          'warning',
          'logic_missing_branch',
          `Logic step "${node.data.title}" does not branch to another step yet.`
        );
      }

      if (outgoing.length === 2) {
        const labels = outgoing.map((edge) => edge.label.trim()).filter((label) => label.length > 0);
        if (labels.length !== outgoing.length) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'warning',
            'logic_missing_edge_labels',
            `Logic step "${node.data.title}" should label both outgoing links so the branches are clear.`
          );
        } else if (new Set(labels).size !== labels.length) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'warning',
            'logic_duplicate_edge_labels',
            `Logic step "${node.data.title}" should use distinct labels for its outgoing links.`
          );
        }
      }
    }

    if (node.data.category === 'contract') {
      const action = node.data.config.action ?? 'call';
      if (action === 'call') {
        if (!node.data.binding) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'error',
            'contract_missing_binding',
            `Contract step "${node.data.title}" must bind to a public entrypoint or switch to deploy-only mode.`
          );
        } else if (!publicEntrypoints.has(node.data.binding)) {
          pushNodeDiagnostic(
            diagnostics,
            node,
            'error',
            'contract_invalid_binding',
            `Contract step "${node.data.title}" points to "${node.data.binding}", which is not a public entrypoint.`
          );
        }
      }

      if (incoming === 0 && workflow.nodes.length > 1) {
        pushNodeDiagnostic(
          diagnostics,
          node,
          'warning',
          'contract_missing_upstream',
          `Contract step "${node.data.title}" is not connected to any upstream workflow step.`
        );
      }
    }

    if (node.data.category === 'output' && !(node.data.config.channel ?? '').trim()) {
      pushNodeDiagnostic(
        diagnostics,
        node,
        'warning',
        'output_missing_channel',
        `Output step "${node.data.title}" should describe where the result is sent.`
      );
    }
  }

  for (const edge of workflow.edges) {
    const sourceNode = nodesById.get(edge.source);
    if (!sourceNode || sourceNode.data.category !== 'logic') continue;
    const siblingEdges = outgoingEdges.get(edge.source) ?? [];
    if (siblingEdges.length < 2 || edge.label.trim().length > 0) continue;
    diagnostics.push({
      code: 'logic_edge_missing_label',
      severity: 'warning',
      message: `Link "${sourceNode.data.title} -> ${nodesById.get(edge.target)?.data.title ?? edge.target}" should be labeled.`,
      target: {
        type: 'edge',
        id: edge.id,
      },
    });
  }

  return diagnostics;
}
