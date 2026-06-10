<template>
  <div class="contract-studio-builder">
    <div ref="workspaceEl" class="contract-studio-builder__workspace" />
  </div>
</template>

<script setup lang="ts">
import * as Blockly from 'blockly';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { KotodamaStudioWorkspaceSummary } from '@/shared/lib/kotodama-studio-source';
import {
  buildStudioSections,
  createStudioToolbox,
  ensureStudioBlocklyRegistered,
  loadStudioTemplate,
  loadStudioWorkspaceState,
  reconcileStudioWorkspaceReferences,
  saveStudioWorkspaceState,
  studioTheme,
  summarizeStudioWorkspace,
  validateStudioWorkspace,
  type StudioSections,
  type StudioTemplateId,
  type StudioToolboxMode,
  type StudioWorkspaceIssue,
} from './blockly';

interface Props {
  modelValue: Record<string, unknown> | null
  toolboxMode: StudioToolboxMode
  templateId: StudioTemplateId
  templateNonce: number
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown> | null]
  'update:sections': [value: StudioSections]
  'update:summary': [value: KotodamaStudioWorkspaceSummary]
  'update:issues': [value: StudioWorkspaceIssue[]]
}>();

const workspaceEl = ref<HTMLDivElement | null>(null);
let workspace: Blockly.WorkspaceSvg | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeFrame = 0;
let syncing = false;

function selectDefaultToolboxCategory() {
  workspace?.getToolbox()?.selectItemByPosition(3);
}

function runWorkspaceResize() {
  if (!workspace) return;
  Blockly.svgResize(workspace);
}

function scheduleWorkspaceResize() {
  if (typeof window === 'undefined') return;
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    runWorkspaceResize();
  });
}

function emitWorkspaceState() {
  if (!workspace || syncing) return;
  reconcileStudioWorkspaceReferences(workspace);
  emit('update:modelValue', saveStudioWorkspaceState(workspace));
  emit('update:sections', buildStudioSections(workspace));
  emit('update:summary', summarizeStudioWorkspace(workspace));
  emit('update:issues', validateStudioWorkspace(workspace));
}

function loadState(state: Record<string, unknown> | null, templateId: StudioTemplateId) {
  if (!workspace) return;
  syncing = true;
  loadStudioWorkspaceState(workspace, state, templateId);
  syncing = false;
  emitWorkspaceState();
}

onMounted(() => {
  ensureStudioBlocklyRegistered();
  if (!workspaceEl.value) return;

  workspace = Blockly.inject(workspaceEl.value, {
    toolbox: createStudioToolbox(props.toolboxMode),
    theme: studioTheme(),
    grid: {
      spacing: 24,
      length: 2,
      colour: '#e9b783',
      snap: true,
    },
    move: {
      drag: true,
      wheel: true,
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.9,
      maxScale: 1.4,
      minScale: 0.45,
      scaleSpeed: 1.15,
    },
    trashcan: true,
  });

  loadState(props.modelValue, props.templateId);
  selectDefaultToolboxCategory();
  nextTick(() => {
    scheduleWorkspaceResize();
  });
  window.addEventListener('resize', scheduleWorkspaceResize);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduleWorkspaceResize();
    });
    resizeObserver.observe(workspaceEl.value);
    if (workspaceEl.value.parentElement) {
      resizeObserver.observe(workspaceEl.value.parentElement);
    }
  }
  workspace.addChangeListener(() => {
    emitWorkspaceState();
  });
});

watch(
  () => props.toolboxMode,
  (value) => {
    workspace?.updateToolbox(createStudioToolbox(value));
    selectDefaultToolboxCategory();
    scheduleWorkspaceResize();
  }
);

watch(
  () => props.modelValue,
  (value) => {
    if (!workspace) return;
    if (syncing) return;
    const nextState = JSON.stringify(value ?? null);
    const currentState = JSON.stringify(saveStudioWorkspaceState(workspace));
    if (nextState === currentState) return;
    loadState(value, props.templateId);
  },
  { deep: true }
);

watch(
  () => props.templateNonce,
  () => {
    if (!workspace) return;
    syncing = true;
    loadStudioTemplate(workspace, props.templateId);
    syncing = false;
    emitWorkspaceState();
    scheduleWorkspaceResize();
  }
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleWorkspaceResize);
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame);
    }
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  workspace?.dispose();
  workspace = null;
});
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.contract-studio-builder {
  height: 100%;
  min-height: 100%;
  display: grid;
  position: relative;
  background:
    linear-gradient(180deg, rgba(255, 251, 245, 0.88), rgba(245, 235, 216, 0.96)),
    linear-gradient(90deg, rgba(199, 75, 42, 0.08), transparent 24%, transparent 76%, rgba(199, 75, 42, 0.06));

  &__workspace {
    height: 100%;
    min-height: 100%;
    width: 100%;
  }

  .blocklySvg {
    background: transparent;
  }

  .blocklyMainBackground {
    stroke: rgba(129, 86, 46, 0.2);
    fill: rgba(255, 248, 238, 0.72);
  }

  .blocklyToolboxDiv {
    background:
      linear-gradient(180deg, rgba(199, 75, 42, 0.12), rgba(239, 224, 196, 0.98) 18%, rgba(232, 214, 184, 0.98));
    border-inline-end: 1px solid rgba(129, 86, 46, 0.18);
    box-shadow: 12px 0 24px rgba(84, 49, 27, 0.08);
  }

  .blocklyFlyout,
  .blocklyFlyoutBackground {
    fill: rgba(247, 239, 224, 0.98);
  }

  .blocklyTreeRoot {
    padding: size(0.75) size(0.5);
  }

  .blocklyTreeRow {
    margin: size(0.25) 0;
    border-radius: size(2.5);
    padding: size(0.55) size(0.9);
    transition:
      background-color 180ms ease,
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .blocklyTreeLabel {
    color: #43281c;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: var(--app-font-family, 'Sora'), sans-serif;
    font-weight: 600;
  }

  .blocklyText,
  .blocklyTreeLabel,
  .blocklyHtmlInput,
  .blocklyWidgetDiv .blocklyMenu,
  .blocklyDropDownDiv .blocklyMenu {
    font-family: var(--app-font-family, 'Sora'), sans-serif;
  }

  .blocklyTreeRow:not(.blocklyTreeSelected):hover {
    transform: translateX(2px);
    background: rgba(199, 75, 42, 0.08);
  }

  .blocklyTreeSelected > .blocklyTreeRow {
    background:
      linear-gradient(180deg, rgba(199, 75, 42, 0.18), rgba(199, 75, 42, 0.12)),
      rgba(255, 247, 240, 0.9);
    box-shadow:
      inset 3px 0 0 #c74b2a,
      0 8px 16px rgba(84, 49, 27, 0.08);
  }

  .blocklyScrollbarHandle {
    fill: rgba(168, 106, 43, 0.82);
  }

  .blocklyZoom > image,
  .blocklyTrash > image {
    opacity: 0.88;
  }
}

html.dark .contract-studio-builder {
  background:
    linear-gradient(180deg, rgba(43, 28, 22, 0.94), rgba(30, 22, 18, 0.98)),
    linear-gradient(90deg, rgba(199, 75, 42, 0.12), transparent 24%, transparent 76%, rgba(199, 75, 42, 0.08));

  .blocklyMainBackground {
    stroke: rgba(245, 217, 182, 0.08);
    fill: rgba(54, 40, 33, 0.72);
  }

  .blocklyToolboxDiv {
    background:
      linear-gradient(180deg, rgba(199, 75, 42, 0.2), rgba(67, 44, 34, 0.98) 18%, rgba(44, 31, 25, 0.98));
    border-inline-end-color: rgba(245, 217, 182, 0.08);
    box-shadow: 12px 0 24px rgba(0, 0, 0, 0.24);
  }

  .blocklyFlyout,
  .blocklyFlyoutBackground {
    fill: rgba(52, 38, 31, 0.98);
  }

  .blocklyTreeLabel {
    color: #f5dcc2;
  }

  .blocklyTreeRow:not(.blocklyTreeSelected):hover {
    background: rgba(199, 75, 42, 0.12);
  }

  .blocklyTreeSelected > .blocklyTreeRow {
    background:
      linear-gradient(180deg, rgba(199, 75, 42, 0.28), rgba(199, 75, 42, 0.16)),
      rgba(66, 45, 35, 0.96);
  }

  .blocklyScrollbarHandle {
    fill: rgba(217, 155, 92, 0.78);
  }
}
</style>
