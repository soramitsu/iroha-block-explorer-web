<template>
  <div
    class="studio-flow-node"
    :class="[
      `studio-flow-node--${data.category}`,
      { 'studio-flow-node--selected': selected },
    ]"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="studio-flow-node__handle"
    />

    <div class="studio-flow-node__eyebrow">
      {{ data.category }}
    </div>
    <strong class="studio-flow-node__title">{{ data.title }}</strong>
    <p class="studio-flow-node__caption">{{ data.caption }}</p>
    <div
      v-if="workflowNodeBadges(data).length"
      class="studio-flow-node__meta"
    >
      <span
        v-for="badge in workflowNodeBadges(data)"
        :key="badge"
        class="studio-flow-node__badge"
      >
        {{ badge }}
      </span>
    </div>
    <span
      v-if="data.binding"
      class="studio-flow-node__binding"
    >
      {{ data.binding }}
    </span>

    <Handle
      type="source"
      :position="Position.Right"
      class="studio-flow-node__handle"
    />
  </div>
</template>

<script setup lang="ts">
import type { KotodamaStudioWorkflowNodeData } from '@/shared/lib/kotodama-studio-document';
import { Handle, Position, type NodeProps } from '@vue-flow/core';

defineProps<NodeProps<KotodamaStudioWorkflowNodeData>>();

function workflowNodeBadges(data: KotodamaStudioWorkflowNodeData): string[] {
  switch (data.category) {
    case 'trigger':
      return [
        data.config.mode === 'schedule' ? 'schedule' : data.config.mode === 'manual' ? 'manual' : 'pre-commit',
        data.config.triggerId ?? '',
      ].filter((value) => value.trim().length > 0);
    case 'data':
      return [data.config.source ?? '', data.config.scope ?? ''].filter((value) => value.trim().length > 0).slice(0, 2);
    case 'logic':
      return [data.config.condition ?? ''].filter((value) => value.trim().length > 0);
    case 'contract':
      return [data.config.action ?? 'call'].filter((value) => value.trim().length > 0);
    case 'output':
      return [data.config.channel ?? '', data.config.audience ?? ''].filter((value) => value.trim().length > 0).slice(0, 2);
  }
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.studio-flow-node {
  --studio-node-accent: #c74b2a;
  min-width: 200px;
  max-width: 240px;
  border-radius: size(3);
  padding: size(1.5) size(1.35);
  border: 1px solid color-mix(in srgb, var(--studio-node-accent) 18%, rgba(117, 77, 44, 0.18));
  background:
    linear-gradient(180deg, rgba(255, 253, 248, 0.99), rgba(246, 236, 216, 0.96));
  box-shadow:
    0 18px 36px rgba(72, 43, 24, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.66) inset;
  display: grid;
  gap: size(0.5);
  color: #312117;
  position: relative;
  overflow: visible;
  font-family: var(--app-font-family, 'Sora'), sans-serif;

  &__eyebrow {
    width: fit-content;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10px;
    color: var(--studio-node-accent);
    padding: size(0.2) size(0.65);
    border-radius: 999px;
    background: rgba(255, 248, 236, 0.88);
    border: 1px solid rgba(150, 108, 73, 0.18);
  }

  &__title {
    @include tpg-h4;
    font-family: var(--app-font-family, 'Sora'), sans-serif;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  &__caption {
    @include tpg-s4;
    color: #6a4f3c;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.35);
  }

  &__badge {
    width: fit-content;
    padding: size(0.22) size(0.65);
    border-radius: 999px;
    background: rgba(79, 107, 138, 0.1);
    color: #5b4637;
    font-size: 11px;
    border: 1px solid rgba(79, 107, 138, 0.12);
  }

  &__binding {
    width: fit-content;
    padding: size(0.3) size(0.8);
    border-radius: size(2);
    background: rgba(199, 75, 42, 0.1);
    color: var(--studio-node-accent);
    font-size: 12px;
    border: 1px solid rgba(199, 75, 42, 0.14);
  }

  &__handle.vue-flow__handle {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(255, 248, 236, 0.96);
    background: var(--studio-node-accent);
    box-shadow:
      0 0 0 10px rgba(255, 248, 236, 0.24),
      0 8px 14px rgba(72, 43, 24, 0.18);
  }

  &__handle.vue-flow__handle-left {
    left: 2px;
  }

  &__handle.vue-flow__handle-right {
    right: 2px;
  }

  &--trigger {
    --studio-node-accent: #6d8451;
  }

  &--data {
    --studio-node-accent: #4f6b8a;
  }

  &--contract {
    --studio-node-accent: #c74b2a;
  }

  &--logic {
    --studio-node-accent: #7a6244;
  }

  &--output {
    --studio-node-accent: #a86a2b;
  }

  &--selected {
    box-shadow:
      0 22px 44px rgba(101, 58, 31, 0.16),
      0 0 0 2px color-mix(in srgb, var(--studio-node-accent) 45%, rgba(255, 248, 236, 0.95));
    transform: translateY(-2px);
  }
}

html.dark .studio-flow-node {
  background: linear-gradient(180deg, rgba(62, 46, 36, 0.98), rgba(46, 34, 29, 0.96));
  border-color: rgba(244, 223, 188, 0.12);
  color: #f6e6cf;
  box-shadow:
    0 22px 42px rgba(0, 0, 0, 0.36),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;

  &__eyebrow {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(244, 223, 188, 0.08);
  }

  &__caption {
    color: #d7c1a8;
  }

  &__binding {
    background: rgba(199, 75, 42, 0.16);
    border-color: rgba(199, 75, 42, 0.24);
  }

  &__badge {
    background: rgba(255, 255, 255, 0.06);
    color: #e8d6c1;
    border-color: rgba(244, 223, 188, 0.08);
  }
}
</style>
