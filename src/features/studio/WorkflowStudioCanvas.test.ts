import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import WorkflowStudioCanvas from './WorkflowStudioCanvas.vue';

const vueFlowMocks = vi.hoisted(() => ({
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  applyEdgeChanges: vi.fn((changes, edges) => {
    let nextEdges = [...edges];

    for (const change of changes) {
      if (change.type === 'add') {
        nextEdges = [...nextEdges, change.item];
        continue;
      }

      if (change.type === 'remove') {
        nextEdges = nextEdges.filter((edge) => edge.id !== change.id);
      }
    }

    return nextEdges;
  }),
  applyNodeChanges: vi.fn((changes, nodes) => {
    let nextNodes = [...nodes];

    for (const change of changes) {
      if (change.type === 'add') {
        nextNodes = [...nextNodes, change.item];
        continue;
      }

      if (change.type === 'remove') {
        nextNodes = nextNodes.filter((node) => node.id !== change.id);
        continue;
      }

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

const resizeObservers: ResizeObserverMock[] = [];

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

vi.mock('@vue-flow/core', async () => {
  const vue = await import('vue');

  return {
    VueFlow: vue.defineComponent({
      name: 'VueFlow',
      emits: ['connect', 'nodes-change', 'edges-change'],
      setup(_, { slots, emit }) {
        return () => vue.h('div', { 'data-test': 'vue-flow-stub' }, [
          vue.h('button', {
            'data-test': 'emit-connect',
            onClick: () => emit('connect', { source: 'trigger-1', target: 'contract-1' }),
          }),
          vue.h('button', {
            'data-test': 'emit-invalid-connect',
            onClick: () => emit('connect', { source: 'output-1', target: 'trigger-1' }),
          }),
          vue.h('button', {
            'data-test': 'emit-edge-remove',
            onClick: () => emit('edges-change', [{ id: 'edge-trigger-contract', type: 'remove' }]),
          }),
          vue.h('button', {
            'data-test': 'emit-node-position',
            onClick: () => emit('nodes-change', [{ id: 'trigger-1', type: 'position', position: { x: 180, y: 190 } }]),
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

describe('WorkflowStudioCanvas', () => {
  beforeEach(() => {
    vueFlowMocks.addEdge.mockClear();
    vueFlowMocks.applyEdgeChanges.mockClear();
    vueFlowMocks.applyNodeChanges.mockClear();
    vueFlowMocks.fitView.mockClear();
    vueFlowMocks.updateNodeInternals.mockClear();
    resizeObservers.length = 0;

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('does not emit duplicate model updates when mirroring props into local state', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(vueFlowMocks.fitView).toHaveBeenCalled();
    expect(vueFlowMocks.fitView).toHaveBeenCalledWith(expect.objectContaining({
      minZoom: 0.55,
      maxZoom: 1.4,
    }));
    expect(vueFlowMocks.updateNodeInternals).toHaveBeenCalledWith(['trigger-1']);
  });

  it('emits a new workflow model when the user adds a contract node', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
          nodes: [],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    const initialFitCalls = vueFlowMocks.fitView.mock.calls.length;
    const contractButton = wrapper.findAll('button').find((button) => button.text() === 'Add contract');
    expect(contractButton).toBeDefined();

    await contractButton!.trigger('click');
    await settle();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();

    const latestModel = emitted!.at(-1)?.[0] as {
      nodes: Array<{
        data: {
          category: string
          binding: string | null
          config: Record<string, string>
        }
      }>
      edges: unknown[]
    };

    expect(latestModel.nodes).toHaveLength(1);
    expect(latestModel.nodes[0]?.data.category).toBe('contract');
    expect(latestModel.nodes[0]?.data.binding).toBe('celebrate');
    expect(latestModel.nodes[0]?.data.config.action).toBe('call');
    expect(latestModel.edges).toEqual([]);
    expect(wrapper.emitted('select-node')).toEqual([[ 'contract-1' ]]);
    expect(vueFlowMocks.fitView.mock.calls.length).toBeGreaterThan(initialFitCalls);
    expect(vueFlowMocks.fitView).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: ['contract-1'],
    }));
  });

  it('allocates new node ids from the highest category suffix instead of node count', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
          nodes: [
            {
              id: 'contract-1',
              type: 'studio',
              position: { x: 80, y: 80 },
              data: {
                title: 'First contract',
                caption: 'Run the first contract.',
                category: 'contract',
                binding: 'celebrate',
                config: {},
              },
            },
            {
              id: 'contract-7',
              type: 'studio',
              position: { x: 320, y: 80 },
              data: {
                title: 'Seventh contract',
                caption: 'Run the later contract.',
                category: 'contract',
                binding: null,
                config: {},
              },
            },
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    const contractButton = wrapper.findAll('button').find((button) => button.text() === 'Add contract');
    expect(contractButton).toBeDefined();

    await contractButton!.trigger('click');
    await settle();

    const latestModel = wrapper.emitted('update:modelValue')!.at(-1)?.[0] as {
      nodes: Array<{ id: string }>
    };

    expect(latestModel.nodes.map((node) => node.id)).toContain('contract-8');
    expect(vueFlowMocks.fitView).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: ['contract-8'],
    }));
  });

  it('keeps dragging and connecting stable by delegating to Vue Flow helpers', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
              position: { x: 300, y: 80 },
              data: {
                title: 'Contract',
                caption: 'Run the contract.',
                category: 'contract',
                binding: 'celebrate',
                config: {},
              },
            },
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    await wrapper.get('[data-test="emit-node-position"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="emit-connect"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="emit-connect"]').trigger('click');
    await settle();

    const latestModel = wrapper.emitted('update:modelValue')!.at(-1)?.[0] as {
      nodes: Array<{ id: string, position: { x: number, y: number } }>
      edges: Array<{ source: string, target: string }>
    };

    expect(latestModel.nodes.find((node) => node.id === 'trigger-1')?.position).toEqual({ x: 180, y: 190 });
    expect(latestModel.edges).toEqual([
      expect.objectContaining({
        source: 'trigger-1',
        target: 'contract-1',
      }),
    ]);
    expect(vueFlowMocks.applyNodeChanges).toHaveBeenCalled();
    expect(vueFlowMocks.addEdge).toHaveBeenCalled();
  });

  it('rejects semantically invalid connections before they reach the edge list', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
              id: 'output-1',
              type: 'studio',
              position: { x: 300, y: 80 },
              data: {
                title: 'Finish',
                caption: 'Render the output.',
                category: 'output',
                binding: null,
                config: {},
              },
            },
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    await wrapper.get('[data-test="emit-invalid-connect"]').trigger('click');
    await settle();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('lets users reconnect a workflow link after it was removed', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
              position: { x: 300, y: 80 },
              data: {
                title: 'Contract',
                caption: 'Run the contract.',
                category: 'contract',
                binding: 'celebrate',
                config: {},
              },
            },
          ],
          edges: [{ id: 'edge-trigger-contract', source: 'trigger-1', target: 'contract-1', label: '' }],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    await wrapper.get('[data-test="emit-edge-remove"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="emit-connect"]').trigger('click');
    await settle();

    const latestModel = wrapper.emitted('update:modelValue')!.at(-1)?.[0] as {
      edges: Array<{ id: string, source: string, target: string }>
    };

    expect(latestModel.edges).toEqual([
      expect.objectContaining({
        id: 'edge-trigger-1-contract-1',
        source: 'trigger-1',
        target: 'contract-1',
      }),
    ]);
    expect(vueFlowMocks.applyEdgeChanges).toHaveBeenCalled();
    expect(vueFlowMocks.addEdge).toHaveBeenCalledTimes(1);
  });

  it('places new nodes into the first open workflow slot instead of overlapping an occupied one', async () => {
    const wrapper = mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
              position: { x: 720, y: 80 },
              data: {
                title: 'Contract',
                caption: 'Run the contract.',
                category: 'contract',
                binding: 'celebrate',
                config: {},
              },
            },
            {
              id: 'output-1',
              type: 'studio',
              position: { x: 80, y: 300 },
              data: {
                title: 'Finish',
                caption: 'Render the output.',
                category: 'output',
                binding: null,
                config: {},
              },
            },
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    const contractButton = wrapper.findAll('button').find((button) => button.text() === 'Add contract');
    expect(contractButton).toBeDefined();

    await contractButton!.trigger('click');
    await settle();

    const latestModel = wrapper.emitted('update:modelValue')!.at(-1)?.[0] as {
      nodes: Array<{ id: string, position: { x: number, y: number } }>
    };

    expect(latestModel.nodes.find((node) => node.id === 'contract-2')?.position).toEqual({
      x: 400,
      y: 80,
    });
  });

  it('refits the viewport when the canvas layout changes', async () => {
    mount(WorkflowStudioCanvas, {
      props: {
        modelValue: {
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
          ],
          edges: [],
        },
        linkedEntrypoints: ['celebrate'],
      },
    });

    await settle();

    const initialFitCalls = vueFlowMocks.fitView.mock.calls.length;
    expect(resizeObservers).toHaveLength(1);

    resizeObservers[0]?.trigger();
    await settle();

    expect(vueFlowMocks.fitView.mock.calls.length).toBeGreaterThan(initialFitCalls);
  });
});
