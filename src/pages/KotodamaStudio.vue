<template>
  <div class="kotodama-studio">
    <header class="kotodama-studio__topbar">
      <div>
        <span class="kotodama-studio__eyebrow">{{ $t('studio.nav') }}</span>
        <h1>{{ $t('studio.title') }}</h1>
        <p>{{ graphNarrative }}</p>
      </div>

      <div class="kotodama-studio__actions">
        <BaseButton
          data-test="studio-compile"
          bordered
          :disabled="compileUnavailable"
          @click="runCompile"
        >
          {{ compileState.status === 'running' ? $t('studio.compileBusy') : $t('studio.compileAction') }}
        </BaseButton>
        <BaseButton bordered @click="exportDocument">
          {{ $t('studio.exportAction') }}
        </BaseButton>
        <BaseButton bordered @click="triggerImport">
          {{ $t('studio.importAction') }}
        </BaseButton>
        <BaseButton
          data-test="studio-deploy"
          bordered
          :disabled="deployUnavailable"
          @click="runDeploy"
        >
          {{ $t('studio.deployAction') }}
        </BaseButton>
        <input
          ref="importInput"
          class="kotodama-studio__import"
          type="file"
          accept="application/json"
          @change="handleImportChange"
        >
      </div>
    </header>

    <section class="kotodama-studio__metrics">
      <button
        v-for="template in templateOptions"
        :key="template.id"
        type="button"
        class="kotodama-studio__template"
        :data-test="`studio-template-${template.id}`"
        :class="{ 'kotodama-studio__template--active': selectedTemplate === template.id }"
        @click="applyTemplate(template.id)"
      >
        <strong>{{ template.label }}</strong>
        <span>{{ template.description }}</span>
      </button>
    </section>

    <main class="kotodama-studio__workspace">
      <aside class="kotodama-studio__palette">
        <section class="kotodama-studio__panel">
          <header class="kotodama-studio__panel-header">
            <h2>Typed palette</h2>
            <p>Add real contract constructs to the graph.</p>
          </header>

          <div
            v-for="group in paletteGroups"
            :key="group.name"
            class="kotodama-studio__palette-group"
          >
            <h3>{{ group.name }}</h3>
            <button
              v-for="item in group.items"
              :key="`${group.name}-${item.kind}`"
              type="button"
              class="kotodama-studio__palette-item"
              @click="addGraphNode(item.kind)"
            >
              {{ item.label }}
            </button>
          </div>
        </section>

        <section class="kotodama-studio__panel">
          <header class="kotodama-studio__panel-header">
            <h2>{{ $t('studio.metadataTitle') }}</h2>
            <p>{{ $t('studio.metadataHint') }}</p>
          </header>

          <label
            v-for="field in metadataFields"
            :key="field.key"
            class="kotodama-studio__field"
          >
            <span>{{ field.label }}</span>
            <textarea
              v-if="field.kind === 'textarea'"
              :value="graphDocument.metadata[field.key]"
              rows="3"
              @input="updateMetadataField(field.key, ($event.target as HTMLTextAreaElement).value)"
            />
            <input
              v-else
              :value="graphDocument.metadata[field.key]"
              type="text"
              @input="updateMetadataField(field.key, ($event.target as HTMLInputElement).value)"
            >
          </label>
        </section>
      </aside>

      <section class="kotodama-studio__canvas-panel">
        <div class="kotodama-studio__canvas-header">
          <div>
            <h2>Contract graph</h2>
            <p>{{ sourceOutput.summary.entrypoints.length }} entrypoints, {{ sourceOutput.summary.states.length }} state fields, {{ sourceOutput.summary.triggers.length }} triggers</p>
          </div>
          <span
            class="kotodama-studio__status"
            :class="{ 'kotodama-studio__status--error': blockingDiagnostics.length > 0 }"
          >
            {{ blockingDiagnostics.length > 0 ? `${blockingDiagnostics.length} blocking` : 'Graph ready' }}
          </span>
        </div>

        <ContractGraphCanvas
          v-model="graphDocument.graph"
          v-model:selected-node-id="selectedNodeId"
          :diagnostics="graphDiagnostics"
          data-test="studio-graph-canvas"
          @update:model-value="touchDocument"
        />
      </section>

      <aside class="kotodama-studio__inspector">
        <section class="kotodama-studio__panel">
          <header class="kotodama-studio__panel-header">
            <h2>{{ selectedNode ? selectedNode.data.title : $t('studio.selectedNodeTitle') }}</h2>
            <p>{{ selectedNode ? selectedNode.data.detail : $t('studio.noNodeSelected') }}</p>
          </header>

          <template v-if="selectedNode">
            <label class="kotodama-studio__field">
              <span>Node title</span>
              <input
                data-test="studio-node-title"
                :value="selectedNode.data.title"
                type="text"
                @input="updateSelectedNodeData('title', ($event.target as HTMLInputElement).value)"
              >
            </label>

            <label class="kotodama-studio__field">
              <span>Node detail</span>
              <textarea
                :value="selectedNode.data.detail"
                rows="2"
                @input="updateSelectedNodeData('detail', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>

            <div
              v-if="selectedNodePorts.length"
              class="kotodama-studio__ports"
            >
              <span>Typed ports</span>
              <div
                v-for="port in selectedNodePorts"
                :key="port.id"
                class="kotodama-studio__port"
              >
                <strong>{{ port.label }}</strong>
                <small>{{ port.direction }} · {{ port.valueType }}</small>
              </div>
            </div>

            <div
              v-if="selectedNodeIsFunction"
              class="kotodama-studio__builder"
              data-test="studio-param-builder"
            >
              <div class="kotodama-studio__builder-header">
                <span>Parameters</span>
                <button
                  type="button"
                  @click="addSelectedParam"
                >
                  Add
                </button>
              </div>
              <div
                v-for="(param, index) in selectedParams"
                :key="`${param.name}-${index}`"
                class="kotodama-studio__builder-row"
              >
                <input
                  :value="param.name"
                  aria-label="Parameter name"
                  @input="updateSelectedParam(index, 'name', ($event.target as HTMLInputElement).value)"
                >
                <select
                  :value="param.valueType"
                  aria-label="Parameter type"
                  @change="updateSelectedParam(index, 'valueType', ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="type in valueTypeOptions"
                    :key="type"
                    :value="type"
                  >
                    {{ type }}
                  </option>
                </select>
                <button
                  type="button"
                  @click="removeSelectedParam(index)"
                >
                  Remove
                </button>
              </div>
            </div>

            <label
              v-for="field in visibleSelectedNodeConfigFields"
              :key="field.key"
              class="kotodama-studio__field"
            >
              <span>{{ field.label }}</span>
              <select
                v-if="field.kind === 'select'"
                :value="selectedNode.data.config[field.key] ?? ''"
                @change="updateSelectedNodeConfig(field.key, ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="option in field.options ?? []"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <textarea
                v-else-if="field.kind === 'textarea'"
                :value="selectedNode.data.config[field.key] ?? ''"
                rows="3"
                @input="updateSelectedNodeConfig(field.key, ($event.target as HTMLTextAreaElement).value)"
              />
              <input
                v-else
                :value="selectedNode.data.config[field.key] ?? ''"
                type="text"
                @input="updateSelectedNodeConfig(field.key, ($event.target as HTMLInputElement).value)"
              >
            </label>

            <div
              v-if="selectedOutgoingEdges.length"
              class="kotodama-studio__builder"
              data-test="studio-edge-editor"
            >
              <div class="kotodama-studio__builder-header">
                <span>Outgoing flow</span>
              </div>
              <div
                v-for="edge in selectedOutgoingEdges"
                :key="edge.id"
                class="kotodama-studio__builder-row kotodama-studio__builder-row--edge"
              >
                <select
                  :value="edge.label"
                  aria-label="Edge label"
                  @change="updateEdgeLabel(edge.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="label in edgeLabelOptions"
                    :key="label"
                    :value="label"
                  >
                    {{ label }}
                  </option>
                </select>
                <span>{{ edgeTargetTitle(edge.target) }}</span>
                <button
                  type="button"
                  @click="removeEdge(edge.id)"
                >
                  Remove
                </button>
              </div>
            </div>

            <BaseButton
              bordered
              @click="removeSelectedNode"
            >
              Remove node
            </BaseButton>
          </template>
        </section>

        <section
          data-test="studio-semantic-panel"
          class="kotodama-studio__panel"
        >
          <header class="kotodama-studio__panel-header">
            <h2>{{ $t('studio.semanticTitle') }}</h2>
            <p>{{ graphDiagnostics.length ? $t('studio.semanticHint') : $t('studio.semanticReady') }}</p>
          </header>

          <div
            v-if="graphDiagnostics.length"
            data-test="studio-semantic-diagnostics"
            class="kotodama-studio__diagnostics"
          >
            <button
              v-for="diagnostic in graphDiagnostics"
              :key="`${diagnostic.code}-${diagnostic.nodeId ?? 'global'}-${diagnostic.message}`"
              type="button"
              :class="{ 'kotodama-studio__diagnostic--error': diagnostic.severity === 'error' }"
              @click="selectDiagnostic(diagnostic.nodeId)"
            >
              <strong>{{ diagnostic.severity }}</strong>
              <span>{{ diagnostic.message }}</span>
            </button>
          </div>
        </section>

        <section
          data-test="studio-compile-panel"
          class="kotodama-studio__panel"
        >
          <header class="kotodama-studio__panel-header">
            <h2>{{ $t('studio.compileTitle') }}</h2>
            <p>{{ compilePanelMessage }}</p>
          </header>

          <div
            v-if="compileState.status === 'running'"
            class="kotodama-studio__loading"
          >
            <BaseLoading />
          </div>

          <template v-else-if="compileState.result">
            <dl
              v-if="compileState.result.codeHashHex"
              class="kotodama-studio__facts"
            >
              <div>
                <dt>{{ $t('studio.compileMode') }}</dt>
                <dd data-test="studio-compile-mode">graph-local-browser</dd>
              </div>
              <div>
                <dt>{{ $t('studio.codeHash') }}</dt>
                <dd>{{ compileState.result.codeHashHex }}</dd>
              </div>
              <div>
                <dt>{{ $t('studio.abiHash') }}</dt>
                <dd>{{ compileState.result.abiHashHex }}</dd>
              </div>
            </dl>

            <label class="kotodama-studio__field">
              <span>{{ $t('studio.fields.directDeployPrivateKey') }}</span>
              <input
                v-model="deployPrivateKey"
                data-test="studio-direct-deploy-private-key"
                type="password"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              >
            </label>
            <p class="kotodama-studio__inline-hint">
              {{ $t('studio.directDeployHint') }}
            </p>
          </template>
        </section>

        <section class="kotodama-studio__panel kotodama-studio__panel--source">
          <header class="kotodama-studio__panel-header">
            <h2>{{ $t('studio.sourceTitle') }}</h2>
            <p>{{ $t('studio.sourceHint') }}</p>
          </header>
          <pre data-test="studio-source" class="kotodama-studio__code">{{ generatedSource }}</pre>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { submitContractDeployRequest } from '@/shared/api';
import ContractGraphCanvas from '@/features/studio/ContractGraphCanvas.vue';
import {
  KOTODAMA_STUDIO_GRAPH_CONFIG_FIELDS,
  KOTODAMA_STUDIO_GRAPH_PALETTE,
  buildKotodamaStudioGraphSource,
  cloneKotodamaStudioGraphDocument,
  createKotodamaStudioGraphNode,
  createKotodamaStudioGraphTemplate,
  findKotodamaStudioGraphNodeForLine,
  normalizeKotodamaStudioGraphDocument,
  parseKotodamaStudioGraphDocument,
  parseKotodamaStudioGraphParams,
  refreshKotodamaStudioGraphPorts,
  stringifyKotodamaStudioGraphDocument,
  updateKotodamaStudioGraphNode,
  validateKotodamaStudioGraphDocument,
  type KotodamaStudioGraphConfigField,
  type KotodamaStudioGraphDiagnostic,
  type KotodamaStudioGraphDocumentV2,
  type KotodamaStudioGraphEdge,
  type KotodamaStudioGraphNode,
  type KotodamaStudioGraphNodeKind,
  type KotodamaStudioGraphPaletteItem,
  type KotodamaStudioGraphParam,
  type KotodamaStudioGraphPort,
  type KotodamaStudioGraphTemplateId,
  type KotodamaStudioGraphValueType,
} from '@/shared/lib/kotodama-studio-graph';
import { buildKotodamaStudioDeployDraft, compileKotodamaStudioSource, type KotodamaStudioCompileResult } from '@/shared/lib/kotodama-studio-deploy';

type MetadataKey = 'title' | 'dataspace' | 'authority' | 'chainId' | 'description';

interface TemplateOption {
  id: KotodamaStudioGraphTemplateId
  label: string
  description: string
}

const STORAGE_KEY = 'kotodama_studio_graph_document_v2';
const LEGACY_STORAGE_KEY = 'kotodama_studio_document_v1';

const templateOptions: TemplateOption[] = [
  { id: 'stablecoin', label: 'Stablecoin', description: 'Collateral checks, minting, and returned quotes.' },
  { id: 'threshold_escrow', label: 'Escrow', description: 'State machine with shared guards and releases.' },
  { id: 'asset_ops', label: 'Asset Ops', description: 'Mint, transfer, and burn from one entrypoint.' },
  { id: 'subscription', label: 'Subscription', description: 'Scheduled billing and durable state.' },
  { id: 'irohaswap_reduced', label: 'IrohaSwap Lite', description: 'Pool maps, guards, branches, and swaps.' },
];

const metadataFields: Array<{ key: MetadataKey, label: string, kind: 'text' | 'textarea' }> = [
  { key: 'title', label: 'Contract title', kind: 'text' },
  { key: 'dataspace', label: 'Dataspace', kind: 'text' },
  { key: 'authority', label: 'Authority', kind: 'text' },
  { key: 'chainId', label: 'Chain ID', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'textarea' },
];

const valueTypeOptions: KotodamaStudioGraphValueType[] = [
  'int',
  'bool',
  'AccountId',
  'AssetDefinitionId',
  'DomainId',
  'Name',
  'Json',
  'Blob',
  'NoritoBytes',
];

const effectFieldKeys: Record<string, string[]> = {
  info: ['effect', 'args'],
  transfer_asset: ['effect', 'from', 'to', 'assetDefinition', 'amount', 'args'],
  mint_asset: ['effect', 'account', 'assetDefinition', 'amount', 'args'],
  burn_asset: ['effect', 'account', 'assetDefinition', 'amount', 'args'],
  set_account_detail: ['effect', 'account', 'detailKey', 'detailValue', 'args'],
  execute_query: ['effect', 'queryPayload', 'args'],
  execute_instruction: ['effect', 'instructionPayload', 'args'],
  call_function: ['effect', 'callName', 'callArgs', 'args'],
  custom: ['effect', 'statement'],
};

const notifications = useNotifications();
const importInput = ref<HTMLInputElement | null>(null);
const selectedTemplate = ref<KotodamaStudioGraphTemplateId>('stablecoin');
const selectedNodeId = ref<string | null>(null);
const deployPrivateKey = ref('');
const graphDocument = ref(loadInitialDocument());
const compileState = ref<{
  status: 'idle' | 'running' | 'ready' | 'error'
  error: string
  result: KotodamaStudioCompileResult | null
}>({
  status: 'idle',
  error: '',
  result: null,
});

function loadInitialDocument(): KotodamaStudioGraphDocumentV2 {
  if (typeof window === 'undefined') return createKotodamaStudioGraphTemplate('stablecoin');

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseKotodamaStudioGraphDocument(raw);
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) return normalizeKotodamaStudioGraphDocument(JSON.parse(legacyRaw));
  } catch {
    // Ignore invalid local documents and continue with a known-good graph.
  }

  return createKotodamaStudioGraphTemplate('stablecoin');
}

const sourceOutput = computed(() => buildKotodamaStudioGraphSource(graphDocument.value));
const generatedSource = computed(() => sourceOutput.value.source);
const validationDiagnostics = computed(() => validateKotodamaStudioGraphDocument(graphDocument.value));
const compileDiagnostics = computed<KotodamaStudioGraphDiagnostic[]>(() => {
  const result = compileState.value.result;
  if (!result) return [];
  return [
    ...result.diagnostics.map((diagnostic) => ({
      code: 'compiler_error',
      severity: 'error' as const,
      message: formatDiagnostic(diagnostic),
      nodeId: findKotodamaStudioGraphNodeForLine(sourceOutput.value.ranges, diagnostic.line),
    })),
    ...result.warnings.map((diagnostic) => ({
      code: 'compiler_warning',
      severity: 'warning' as const,
      message: formatDiagnostic(diagnostic),
      nodeId: findKotodamaStudioGraphNodeForLine(sourceOutput.value.ranges, diagnostic.line),
    })),
  ];
});
const graphDiagnostics = computed(() => [...validationDiagnostics.value, ...compileDiagnostics.value]);
const blockingDiagnostics = computed(() => validationDiagnostics.value.filter((diagnostic) => diagnostic.severity === 'error'));
const selectedNode = computed(() =>
  selectedNodeId.value
    ? graphDocument.value.graph.nodes.find((node) => node.id === selectedNodeId.value) ?? null
    : null
);
const selectedNodeConfigFields = computed<KotodamaStudioGraphConfigField[]>(() =>
  selectedNode.value ? KOTODAMA_STUDIO_GRAPH_CONFIG_FIELDS[selectedNode.value.data.kind] : []
);
const visibleSelectedNodeConfigFields = computed<KotodamaStudioGraphConfigField[]>(() => {
  const node = selectedNode.value;
  if (!node) return [];
  if (node.data.kind === 'effect') {
    const keys = new Set(effectFieldKeys[node.data.config.effect ?? 'info'] ?? effectFieldKeys.info);
    return selectedNodeConfigFields.value.filter((field) => keys.has(field.key));
  }
  if (node.data.kind === 'entrypoint' || node.data.kind === 'helper') {
    return selectedNodeConfigFields.value.filter((field) => field.key !== 'params');
  }
  return selectedNodeConfigFields.value;
});
const selectedNodePorts = computed<KotodamaStudioGraphPort[]>(() => selectedNode.value?.data.ports ?? []);
const selectedNodeIsFunction = computed(() => selectedNode.value?.data.kind === 'entrypoint' || selectedNode.value?.data.kind === 'helper');
const selectedParams = computed<KotodamaStudioGraphParam[]>(() => {
  const node = selectedNode.value;
  if (!node || !selectedNodeIsFunction.value) return [];
  const structured = node.data.config.paramsJson;
  if (structured) {
    try {
      const parsed = JSON.parse(structured) as KotodamaStudioGraphParam[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return parseKotodamaStudioGraphParams(node.data.config.params ?? '');
});
const selectedOutgoingEdges = computed<KotodamaStudioGraphEdge[]>(() =>
  selectedNode.value
    ? graphDocument.value.graph.edges.filter((edge) => edge.source === selectedNode.value?.id)
    : []
);
const edgeLabelOptions = computed(() => {
  const kind = selectedNode.value?.data.kind;
  if (kind === 'branch') return ['then', 'else', 'next'];
  if (kind === 'loop') return ['body', 'next'];
  return ['next'];
});
const graphNarrative = computed(() => {
  const summary = sourceOutput.value.summary;
  return `${summary.entrypoints.length} entrypoint${summary.entrypoints.length === 1 ? '' : 's'}, ${summary.triggers.length} trigger${summary.triggers.length === 1 ? '' : 's'}, ${summary.states.length} state field${summary.states.length === 1 ? '' : 's'}.`;
});
const paletteGroups = computed(() => {
  const groups = new Map<KotodamaStudioGraphPaletteItem['group'], KotodamaStudioGraphPaletteItem[]>();
  for (const item of KOTODAMA_STUDIO_GRAPH_PALETTE) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
});
const compileUnavailable = computed(() => compileState.value.status === 'running' || blockingDiagnostics.value.length > 0);
const deployDraft = computed(() =>
  compileState.value.result && compileState.value.result.diagnostics.length === 0 && blockingDiagnostics.value.length === 0
    ? buildKotodamaStudioDeployDraft({
      authority: graphDocument.value.metadata.authority,
      chainId: graphDocument.value.metadata.chainId,
      dataspace: graphDocument.value.metadata.dataspace,
      compileResult: compileState.value.result,
    })
    : null
);
const deployUnavailable = computed(() => !deployDraft.value || deployPrivateKey.value.trim().length === 0 || blockingDiagnostics.value.length > 0);
const compilePanelMessage = computed(() => {
  if (blockingDiagnostics.value.length > 0) return $tFallback('Fix the graph errors before compiling.');
  if (compileState.value.status === 'running') return $tFallback('Compiling graph-generated Kotodama source.');
  if (compileState.value.status === 'error') return compileState.value.error;
  if (compileState.value.result?.diagnostics.length) return 'Local compile found problems. Select a diagnostic to jump to the graph node.';
  if (compileState.value.result) return $tFallback('Contract bundle compiled locally.');
  return $tFallback('Compile the graph-generated source to refresh hashes and deploy data.');
});

watch(
  graphDocument,
  (document) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, stringifyKotodamaStudioGraphDocument(document));
    } catch {
      // Ignore storage failures; export still works.
    }
  },
  { deep: true, immediate: true }
);

watch(generatedSource, (nextSource, previousSource) => {
  if (!previousSource || nextSource === previousSource || compileState.value.status === 'running') return;
  compileState.value = {
    status: 'idle',
    error: '',
    result: null,
  };
});

function $tFallback(value: string): string {
  return value;
}

function touchDocument() {
  graphDocument.value = refreshKotodamaStudioGraphPorts({
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    metadata: { ...graphDocument.value.metadata },
    graph: {
      nodes: graphDocument.value.graph.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          config: { ...node.data.config },
        },
      })),
      edges: graphDocument.value.graph.edges.map((edge) => ({ ...edge })),
    },
  });
}

function applyTemplate(templateId: KotodamaStudioGraphTemplateId) {
  selectedTemplate.value = templateId;
  graphDocument.value = createKotodamaStudioGraphTemplate(templateId);
  selectedNodeId.value = graphDocument.value.graph.nodes.find((node) => node.data.kind === 'entrypoint')?.id ?? null;
  deployPrivateKey.value = '';
  compileState.value = {
    status: 'idle',
    error: '',
    result: null,
  };
}

function nextNodeIndex(kind: KotodamaStudioGraphNodeKind): number {
  const prefix = `${kind}-`;
  return graphDocument.value.graph.nodes.reduce((highest, node) => {
    if (!node.id.startsWith(prefix)) return highest;
    const suffix = Number.parseInt(node.id.slice(prefix.length), 10);
    return Number.isFinite(suffix) ? Math.max(highest, suffix) : highest;
  }, 0) + 1;
}

function addGraphNode(kind: KotodamaStudioGraphNodeKind) {
  const node = createKotodamaStudioGraphNode(kind, nextNodeIndex(kind), {
    x: 120 + (graphDocument.value.graph.nodes.length % 4) * 320,
    y: 160 + Math.floor(graphDocument.value.graph.nodes.length / 4) * 220,
  });
  const nextGraph = {
    nodes: [...graphDocument.value.graph.nodes, node],
    edges: [...graphDocument.value.graph.edges],
  };
  const selected = selectedNode.value;
  if (selected && canAutoConnect(selected, node)) {
    nextGraph.edges.push({
      id: `edge-${selected.id}-${node.id}-next`,
      source: selected.id,
      target: node.id,
      label: selected.data.kind === 'branch' ? nextBranchLabel(selected.id) : 'next',
    });
  }

  graphDocument.value = refreshKotodamaStudioGraphPorts({
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    graph: nextGraph,
  });
  selectedNodeId.value = node.id;
}

function canAutoConnect(source: KotodamaStudioGraphNode, target: KotodamaStudioGraphNode): boolean {
  const targetBody = ['guard', 'branch', 'loop', 'formula', 'assign_state', 'map_write', 'effect', 'return', 'note'].includes(target.data.kind);
  if (!targetBody) return false;
  if (['state', 'map_state', 'trigger', 'return', 'note'].includes(source.data.kind)) return false;
  const outgoing = graphDocument.value.graph.edges.filter((edge) => edge.source === source.id);
  return source.data.kind === 'branch' ? outgoing.length < 3 : outgoing.length === 0;
}

function nextBranchLabel(sourceId: string): string {
  const labels = new Set(graphDocument.value.graph.edges.filter((edge) => edge.source === sourceId).map((edge) => edge.label));
  if (!labels.has('then')) return 'then';
  if (!labels.has('else')) return 'else';
  return 'next';
}

function updateMetadataField(key: MetadataKey, value: string) {
  graphDocument.value = {
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    metadata: {
      ...graphDocument.value.metadata,
      [key]: value,
    },
  };
}

function updateSelectedNodeData(field: 'title' | 'detail', value: string) {
  const node = selectedNode.value;
  if (!node) return;
  graphDocument.value = updateKotodamaStudioGraphNode(graphDocument.value, node.id, (current) => ({
    ...current,
    data: {
      ...current.data,
      [field]: value,
    },
  }));
}

function updateSelectedNodeConfig(key: string, value: string) {
  const node = selectedNode.value;
  if (!node) return;
  graphDocument.value = updateKotodamaStudioGraphNode(graphDocument.value, node.id, (current) => ({
    ...current,
    data: {
      ...current.data,
      config: {
        ...current.data.config,
        [key]: value.trim(),
      },
    },
  }));
}

function serializeParams(params: KotodamaStudioGraphParam[]): string {
  return params.map((param) => `${param.name}: ${param.valueType}`).join(', ');
}

function writeSelectedParams(params: KotodamaStudioGraphParam[]) {
  const node = selectedNode.value;
  if (!node) return;
  graphDocument.value = updateKotodamaStudioGraphNode(graphDocument.value, node.id, (current) => ({
    ...current,
    data: {
      ...current.data,
      config: {
        ...current.data.config,
        params: serializeParams(params),
        paramsJson: JSON.stringify(params),
      },
    },
  }));
}

function addSelectedParam() {
  writeSelectedParams([
    ...selectedParams.value,
    { name: `param_${selectedParams.value.length + 1}`, valueType: 'int' },
  ]);
}

function updateSelectedParam(index: number, key: keyof KotodamaStudioGraphParam, value: string) {
  const params = selectedParams.value.map((param) => ({ ...param }));
  const current = params[index];
  if (!current) return;
  params[index] = {
    ...current,
    [key]: key === 'name' ? value.trim().replace(/[^A-Za-z0-9_]+/g, '_') : value,
  };
  writeSelectedParams(params);
}

function removeSelectedParam(index: number) {
  writeSelectedParams(selectedParams.value.filter((_, itemIndex) => itemIndex !== index));
}

function edgeTargetTitle(targetId: string): string {
  const target = graphDocument.value.graph.nodes.find((node) => node.id === targetId);
  return target ? target.data.title : targetId;
}

function updateEdgeLabel(edgeId: string, label: string) {
  graphDocument.value = refreshKotodamaStudioGraphPorts({
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    metadata: { ...graphDocument.value.metadata },
    graph: {
      nodes: graphDocument.value.graph.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          config: { ...node.data.config },
          ports: node.data.ports.map((port) => ({ ...port })),
        },
      })),
      edges: graphDocument.value.graph.edges.map((edge) => edge.id === edgeId
        ? { ...edge, label, id: `edge-${edge.source}-${edge.target}-${label || 'next'}` }
        : { ...edge }),
    },
  });
}

function removeEdge(edgeId: string) {
  graphDocument.value = refreshKotodamaStudioGraphPorts({
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    metadata: { ...graphDocument.value.metadata },
    graph: {
      nodes: graphDocument.value.graph.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          config: { ...node.data.config },
          ports: node.data.ports.map((port) => ({ ...port })),
        },
      })),
      edges: graphDocument.value.graph.edges.filter((edge) => edge.id !== edgeId),
    },
  });
}

function removeSelectedNode() {
  const nodeId = selectedNodeId.value;
  if (!nodeId) return;
  graphDocument.value = refreshKotodamaStudioGraphPorts({
    ...graphDocument.value,
    updatedAt: new Date().toISOString(),
    graph: {
      nodes: graphDocument.value.graph.nodes.filter((node) => node.id !== nodeId),
      edges: graphDocument.value.graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    },
  });
  selectedNodeId.value = null;
}

function selectDiagnostic(nodeId: string | null) {
  if (!nodeId) return;
  selectedNodeId.value = nodeId;
}

async function runCompile() {
  if (blockingDiagnostics.value.length > 0) {
    notifications.error('Fix the graph errors before compiling.');
    return;
  }

  compileState.value = {
    status: 'running',
    error: '',
    result: null,
  };

  try {
    const result = await compileKotodamaStudioSource({
      source: generatedSource.value,
      summary: sourceOutput.value.summary,
    });
    compileState.value = {
      status: 'ready',
      error: '',
      result,
    };
    if (result.diagnostics.length > 0) {
      notifications.error('Local compile found problems.');
    } else {
      notifications.success('Contract bundle compiled locally.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to compile the graph-generated source.';
    compileState.value = {
      status: 'error',
      error: message,
      result: null,
    };
    notifications.error(message);
  }
}

function triggerImport() {
  importInput.value?.click();
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    graphDocument.value = parseKotodamaStudioGraphDocument(await file.text());
    selectedNodeId.value = graphDocument.value.graph.nodes.find((node) => node.data.kind === 'entrypoint')?.id ?? null;
    deployPrivateKey.value = '';
    compileState.value = {
      status: 'idle',
      error: '',
      result: null,
    };
    notifications.success('Studio graph imported.');
  } catch {
    notifications.error('The selected studio file is not valid JSON.');
  } finally {
    if (input) input.value = '';
  }
}

function exportDocument() {
  if (typeof window === 'undefined') return;
  const exportableDocument = cloneKotodamaStudioGraphDocument(graphDocument.value);
  const blob = new Blob([stringifyKotodamaStudioGraphDocument(exportableDocument)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${buildStudioExportSlug(graphDocument.value.metadata.title)}.json`;
  link.click();
  window.URL.revokeObjectURL(url);
}

function buildStudioExportSlug(title: string): string {
  const normalized = title
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'kotodama-studio-graph';
}

function formatDiagnostic(diagnostic: {
  message: string
  line?: number
  column?: number
}) {
  const location = diagnostic.line
    ? diagnostic.column
      ? `Line ${diagnostic.line}, column ${diagnostic.column}: `
      : `Line ${diagnostic.line}: `
    : '';
  return `${location}${diagnostic.message}`;
}

async function runDeploy() {
  if (!deployDraft.value || compileState.value.result?.diagnostics.length || blockingDiagnostics.value.length > 0) return;
  const privateKey = deployPrivateKey.value.trim();
  if (!privateKey) return;

  try {
    const result = await submitContractDeployRequest({
      authority: deployDraft.value.toriiRequest.authority,
      private_key: privateKey,
      code_b64: deployDraft.value.toriiRequest.code_b64,
      ...(deployDraft.value.toriiRequest.dataspace ? { dataspace: deployDraft.value.toriiRequest.dataspace } : {}),
    });
    if (!result.ok) {
      throw result.error ?? new Error(`Direct deploy failed with status ${result.statusCode}.`);
    }
    deployPrivateKey.value = '';
    notifications.success(`Deploy submitted: ${result.data.tx_hash_hex}`);
  } catch (error) {
    notifications.error(error instanceof Error ? error.message : 'Direct Torii deploy failed.');
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.kotodama-studio {
  min-height: calc(100vh - $header-height-mobile);
  padding: size(1) size(1) size(3);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: size(1);
  color: #2d251f;
  background:
    radial-gradient(circle at 0% 0%, rgba(49, 95, 134, 0.12), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(183, 71, 44, 0.1), transparent 24%),
    linear-gradient(180deg, rgba(249, 246, 240, 0.98), rgba(241, 236, 227, 0.98));
  font-family: var(--app-font-family, 'Sora'), sans-serif;

  @include md {
    min-height: calc(100vh - $header-height);
    padding: size(1.5);
  }

  &__topbar,
  &__canvas-panel,
  &__panel,
  &__template {
    border: 1px solid rgba(81, 72, 63, 0.14);
    background: rgba(255, 252, 246, 0.88);
    box-shadow:
      0 18px 42px rgba(42, 38, 34, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
  }

  &__topbar {
    display: grid;
    gap: size(1);
    padding: size(1.25);
    border-radius: size(1.25);

    @include lg {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
    }

    h1 {
      @include tpg-h1;
      color: #251f1a;
      font-family: var(--app-font-family, 'Sora'), sans-serif;
      letter-spacing: 0;
    }

    p {
      margin: size(0.25) 0 0;
      color: #67584d;
    }
  }

  &__eyebrow {
    display: inline-flex;
    margin-bottom: size(0.35);
    color: #b7472c;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.65);
    justify-content: flex-start;

    @include lg {
      justify-content: flex-end;
    }
  }

  &__metrics {
    display: grid;
    gap: size(0.75);

    @include lg {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  &__template {
    display: grid;
    gap: size(0.25);
    min-height: size(7);
    padding: size(0.95);
    border-radius: size(1);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      transform 160ms ease,
      background-color 160ms ease;

    strong {
      color: #251f1a;
      font-weight: 700;
    }

    span {
      @include tpg-s4;
      color: #67584d;
    }

    &:hover,
    &--active {
      transform: translateY(-1px);
      border-color: rgba(49, 95, 134, 0.34);
      background: rgba(255, 255, 255, 0.96);
    }
  }

  &__workspace {
    min-height: 0;
    display: grid;
    gap: size(1);

    @include xl {
      grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(300px, 380px);
    }
  }

  &__palette,
  &__inspector {
    display: grid;
    gap: size(1);
    align-content: start;
    min-width: 0;
  }

  &__palette {
    resize: horizontal;
    overflow: auto;
    min-width: 220px;
    max-width: 420px;
  }

  &__canvas-panel {
    min-width: 0;
    min-height: 760px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: size(0.75);
    padding: size(0.85);
    border-radius: size(1.25);
  }

  &__canvas-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: size(1);
    padding: size(0.25) size(0.25) 0;

    h2 {
      @include tpg-h3;
      margin: 0;
      color: #251f1a;
      font-family: var(--app-font-family, 'Sora'), sans-serif;
    }

    p {
      margin: size(0.2) 0 0;
      color: #67584d;
    }
  }

  &__status {
    width: fit-content;
    border-radius: 999px;
    padding: size(0.45) size(0.75);
    color: #315f86;
    background: rgba(49, 95, 134, 0.1);
    border: 1px solid rgba(49, 95, 134, 0.16);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;

    &--error {
      color: #992a23;
      background: rgba(153, 42, 35, 0.1);
      border-color: rgba(153, 42, 35, 0.18);
    }
  }

  &__panel {
    display: grid;
    gap: size(1);
    padding: size(1);
    border-radius: size(1.1);
    min-width: 0;
  }

  &__panel--source {
    align-content: start;
  }

  &__panel-header {
    display: grid;
    gap: size(0.25);

    h2 {
      @include tpg-h3;
      margin: 0;
      color: #251f1a;
      font-family: var(--app-font-family, 'Sora'), sans-serif;
    }

    p {
      @include tpg-s4;
      margin: 0;
      color: #67584d;
    }
  }

  &__palette-group {
    display: grid;
    gap: size(0.5);

    h3 {
      margin: 0;
      color: #67584d;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  }

  &__palette-item {
    border: 1px solid rgba(81, 72, 63, 0.14);
    border-radius: size(0.85);
    padding: size(0.75) size(0.85);
    background: rgba(255, 255, 255, 0.62);
    color: #2d251f;
    text-align: left;
    cursor: pointer;

    &:hover {
      border-color: rgba(49, 95, 134, 0.28);
      background: rgba(255, 255, 255, 0.92);
    }
  }

  &__field {
    display: grid;
    gap: size(0.35);

    span {
      @include tpg-s4;
      color: #67584d;
    }

    input,
    textarea,
    select {
      width: 100%;
      min-height: size(4.6);
      border-radius: size(0.85);
      border: 1px solid rgba(81, 72, 63, 0.16);
      background: rgba(255, 255, 255, 0.78);
      padding: size(0.85);
      color: #2d251f;
      font: inherit;
      resize: vertical;

      &:focus {
        outline: 2px solid rgba(49, 95, 134, 0.18);
        border-color: rgba(49, 95, 134, 0.36);
      }
    }
  }

  &__ports,
  &__builder {
    display: grid;
    gap: size(0.55);
    border: 1px solid rgba(81, 72, 63, 0.12);
    border-radius: size(0.85);
    padding: size(0.75);
    background: rgba(255, 255, 255, 0.48);
  }

  &__ports > span,
  &__builder-header span {
    @include tpg-s4;
    color: #67584d;
    font-weight: 700;
  }

  &__port {
    display: flex;
    justify-content: space-between;
    gap: size(0.75);
    border-radius: size(0.6);
    padding: size(0.45) size(0.55);
    background: rgba(49, 95, 134, 0.08);

    strong,
    small {
      @include tpg-s4;
      overflow-wrap: anywhere;
    }

    strong {
      color: #2d251f;
    }

    small {
      color: #315f86;
    }
  }

  &__builder-header,
  &__builder-row {
    display: grid;
    gap: size(0.5);
    align-items: center;
  }

  &__builder-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  &__builder-row {
    grid-template-columns: minmax(0, 1fr) minmax(110px, 140px) auto;

    &--edge {
      grid-template-columns: minmax(90px, 120px) minmax(0, 1fr) auto;
    }

    input,
    select {
      min-height: size(3.4);
      border-radius: size(0.65);
      border: 1px solid rgba(81, 72, 63, 0.16);
      background: rgba(255, 255, 255, 0.78);
      padding: size(0.55);
      color: #2d251f;
      font: inherit;
    }

    button {
      border: 1px solid rgba(81, 72, 63, 0.16);
      border-radius: size(0.65);
      padding: size(0.55) size(0.65);
      background: rgba(255, 255, 255, 0.72);
      color: #2d251f;
      cursor: pointer;
    }
  }

  &__diagnostics {
    display: grid;
    gap: size(0.55);
  }

  &__diagnostics button {
    display: grid;
    gap: size(0.25);
    border: 1px solid rgba(168, 106, 43, 0.2);
    border-radius: size(0.85);
    padding: size(0.75);
    color: #65462c;
    background: rgba(255, 248, 236, 0.82);
    text-align: left;
    cursor: pointer;

    strong {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
  }

  &__diagnostic--error {
    border-color: rgba(153, 42, 35, 0.22) !important;
    color: #992a23 !important;
    background: rgba(153, 42, 35, 0.08) !important;
  }

  &__facts {
    display: grid;
    gap: size(0.75);

    dt {
      @include tpg-s4;
      color: #67584d;
    }

    dd {
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      word-break: break-all;
    }
  }

  &__inline-hint {
    @include tpg-s4;
    color: #67584d;
  }

  &__code {
    margin: 0;
    min-height: 320px;
    max-height: 520px;
    overflow: auto;
    padding: size(1);
    border-radius: size(0.9);
    background: linear-gradient(180deg, #261c17, #1d1512);
    color: #f9eddc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
  }

  &__loading {
    display: flex;
    justify-content: center;
    padding: size(2);
  }

  &__import {
    display: none;
  }
}

html.dark .kotodama-studio {
  color: #f8ead9;
  background:
    radial-gradient(circle at 0% 0%, rgba(49, 95, 134, 0.22), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(183, 71, 44, 0.18), transparent 24%),
    linear-gradient(180deg, rgba(theme-color('body'), 0.98), rgba(theme-color('background'), 0.96));

  &__topbar,
  &__canvas-panel,
  &__panel,
  &__template {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(42, 36, 32, 0.92);
    box-shadow:
      0 20px 44px rgba(0, 0, 0, 0.28),
      0 1px 0 rgba(255, 255, 255, 0.04) inset;
  }

  h1,
  h2,
  .kotodama-studio__template strong,
  .kotodama-studio__canvas-header h2 {
    color: #fff1df;
  }

  p,
  .kotodama-studio__template span,
  .kotodama-studio__panel-header p,
  .kotodama-studio__field span,
  .kotodama-studio__inline-hint {
    color: #d7c4b2;
  }

  .kotodama-studio__palette-item,
  .kotodama-studio__field input,
  .kotodama-studio__field textarea,
  .kotodama-studio__field select {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.06);
    color: #f8ead9;
  }
}
</style>
