import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKotodamaStudioGraphNode, type KotodamaStudioGraphDocumentV2 } from '@/shared/lib/kotodama-studio-graph';
import ContractGraphCanvas from './ContractGraphCanvas.vue';

const vueFlowMocks = vi.hoisted(() => ({
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  applyEdgeChanges: vi.fn((changes, edges) => {
    let nextEdges = [...edges];

    for (const change of changes) {
      if (change.type === 'remove') {
        nextEdges = nextEdges.filter((edge) => edge.id !== change.id);
      }
    }

    return nextEdges;
  }),
  applyNodeChanges: vi.fn((changes, nodes) => {
    let nextNodes = [...nodes];

    for (const change of changes) {
      if (change.type === 'position') {
        nextNodes = nextNodes.map((node) =>
          node.id === change.id
            ? {
              ...node,
              position: change.position,
            }
            : node
        );
      }
    }

    return nextNodes;
  }),
  fitView: vi.fn(() => Promise.resolve(true)),
  updateNodeInternals: vi.fn(),
}));

vi.mock('@vue-flow/core', async () => {
  const vue = await import('vue');

  return {
    VueFlow: vue.defineComponent({
      name: 'VueFlow',
      emits: ['connect', 'nodes-change', 'edges-change', 'node-click', 'pane-click'],
      setup(_, { slots, emit }) {
        return () => vue.h('div', { 'data-test': 'vue-flow-stub' }, [
          vue.h('button', {
            'data-test': 'emit-valid-connect',
            onClick: () => emit('connect', { source: 'entry-1', target: 'effect-1' }),
          }),
          vue.h('button', {
            'data-test': 'emit-invalid-connect',
            onClick: () => emit('connect', { source: 'state-1', target: 'effect-1' }),
          }),
          vue.h('button', {
            'data-test': 'emit-duplicate-branch-connect',
            onClick: () => emit('connect', { source: 'branch-1', target: 'effect-2', label: 'then' }),
          }),
          vue.h('button', {
            'data-test': 'emit-node-position',
            onClick: () => emit('nodes-change', [{ id: 'entry-1', type: 'position', position: { x: 180, y: 190 } }]),
          }),
          vue.h('button', {
            'data-test': 'emit-edge-remove',
            onClick: () => emit('edges-change', [{ id: 'edge-entry-1-effect-1-next', type: 'remove' }]),
          }),
          vue.h('button', {
            'data-test': 'emit-node-click',
            onClick: () => emit('node-click', { node: { id: 'effect-1' } }),
          }),
          vue.h('button', {
            'data-test': 'emit-pane-click',
            onClick: () => emit('pane-click'),
          }),
          slots.default?.(),
        ]);
      },
    }),
    Handle: vue.defineComponent({
      name: 'Handle',
      setup(_, { slots }) {
        return () => vue.h('div', { class: 'vue-flow__handle' }, slots.default?.());
      },
    }),
    Position: {
      Left: 'left',
      Right: 'right',
    },
    MarkerType: {
      ArrowClosed: 'arrow-closed',
    },
    addEdge: vueFlowMocks.addEdge,
    applyEdgeChanges: vueFlowMocks.applyEdgeChanges,
    applyNodeChanges: vueFlowMocks.applyNodeChanges,
    useVueFlow: () => ({
      fitView: vueFlowMocks.fitView,
      updateNodeInternals: vueFlowMocks.updateNodeInternals,
    }),
  };
});

vi.mock('@vue-flow/background', async () => {
  const vue = await import('vue');

  return {
    Background: vue.defineComponent({
      name: 'Background',
      setup() {
        return () => vue.h('div', { 'data-test': 'background-stub' });
      },
    }),
  };
});

vi.mock('@vue-flow/controls', async () => {
  const vue = await import('vue');

  return {
    Controls: vue.defineComponent({
      name: 'Controls',
      setup() {
        return () => vue.h('div', { 'data-test': 'controls-stub' });
      },
    }),
  };
});

vi.mock('@vue-flow/minimap', async () => {
  const vue = await import('vue');

  return {
    MiniMap: vue.defineComponent({
      name: 'MiniMap',
      setup() {
        return () => vue.h('div', { 'data-test': 'minimap-stub' });
      },
    }),
  };
});

async function settle() {
  await flushPromises();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await flushPromises();
}

function createGraph(): KotodamaStudioGraphDocumentV2['graph'] {
  return {
    nodes: [
      {
        ...createKotodamaStudioGraphNode('entrypoint', 1, { x: 80, y: 80 }),
        id: 'entry-1',
      },
      {
        ...createKotodamaStudioGraphNode('effect', 1, { x: 360, y: 80 }),
        id: 'effect-1',
      },
      {
        ...createKotodamaStudioGraphNode('state', 1, { x: 80, y: 280 }),
        id: 'state-1',
      },
    ],
    edges: [],
  };
}

function factory(graph = createGraph()) {
  return mount(ContractGraphCanvas, {
    props: {
      modelValue: graph,
      selectedNodeId: null,
      diagnostics: [],
    },
  });
}

describe('ContractGraphCanvas', () => {
  beforeEach(() => {
    vueFlowMocks.addEdge.mockClear();
    vueFlowMocks.applyEdgeChanges.mockClear();
    vueFlowMocks.applyNodeChanges.mockClear();
    vueFlowMocks.fitView.mockClear();
    vueFlowMocks.updateNodeInternals.mockClear();

    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('does not emit duplicate graph updates when mirroring props into local Vue Flow state', async () => {
    const wrapper = factory();
    await settle();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(vueFlowMocks.fitView).toHaveBeenCalledWith(expect.objectContaining({
      minZoom: 0.25,
      maxZoom: 1.1,
    }));
    expect(vueFlowMocks.updateNodeInternals).toHaveBeenCalledWith(['entry-1', 'effect-1', 'state-1']);
  });

  it('accepts typed entrypoint-to-body connections and rejects declaration-to-body links', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="emit-valid-connect"]').trigger('click');
    await settle();

    expect(vueFlowMocks.addEdge).toHaveBeenCalledWith(expect.objectContaining({
      id: 'edge-entry-1-effect-1-next',
      source: 'entry-1',
      target: 'effect-1',
      label: 'next',
    }), expect.any(Array));

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted?.at(-1)?.[0]).toEqual(expect.objectContaining({
      edges: [expect.objectContaining({
        source: 'entry-1',
        target: 'effect-1',
        label: 'next',
      })],
    }));

    await wrapper.get('[data-test="emit-invalid-connect"]').trigger('click');
    await settle();

    expect(vueFlowMocks.addEdge).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate branch output labels before adding Vue Flow edges', async () => {
    const branch = createKotodamaStudioGraphNode('branch', 1, { x: 360, y: 80 });
    branch.id = 'branch-1';
    const effectTwo = createKotodamaStudioGraphNode('effect', 2, { x: 640, y: 180 });
    effectTwo.id = 'effect-2';
    const wrapper = factory({
      nodes: [
        ...createGraph().nodes,
        branch,
        effectTwo,
      ],
      edges: [{
        id: 'edge-branch-1-effect-1-then',
        source: 'branch-1',
        target: 'effect-1',
        label: 'then',
      }],
    });
    await settle();

    await wrapper.get('[data-test="emit-duplicate-branch-connect"]').trigger('click');
    await settle();

    expect(vueFlowMocks.addEdge).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('emits graph changes for node moves and edge removals', async () => {
    const wrapper = factory({
      ...createGraph(),
      edges: [{
        id: 'edge-entry-1-effect-1-next',
        source: 'entry-1',
        target: 'effect-1',
        label: 'next',
      }],
    });
    await settle();

    await wrapper.get('[data-test="emit-node-position"]').trigger('click');
    await settle();

    expect(vueFlowMocks.applyNodeChanges).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'entry-1', type: 'position' })],
      expect.any(Array)
    );
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(expect.objectContaining({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'entry-1',
          position: { x: 180, y: 190 },
        }),
      ]),
    }));

    await wrapper.get('[data-test="emit-edge-remove"]').trigger('click');
    await settle();

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(expect.objectContaining({
      edges: [],
    }));
  });

  it('emits selection changes from node and pane clicks', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="emit-node-click"]').trigger('click');
    await wrapper.get('[data-test="emit-pane-click"]').trigger('click');

    expect(wrapper.emitted('update:selectedNodeId')).toEqual([
      ['effect-1'],
      [null],
    ]);
  });
});
