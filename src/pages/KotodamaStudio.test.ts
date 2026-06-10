import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, type PropType } from 'vue';
import { i18n } from '@/shared/lib/localization';
import type {
  KotodamaStudioGraphDiagnostic,
  KotodamaStudioGraphDocumentV2,
} from '@/shared/lib/kotodama-studio-graph';
import KotodamaStudio from './KotodamaStudio.vue';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  submitContractDeployRequest: vi.fn(),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/api', () => ({
  submitContractDeployRequest: apiMocks.submitContractDeployRequest,
}));

const STORAGE_KEY = 'kotodama_studio_graph_document_v2';

const ContractGraphCanvasStub = defineComponent({
  name: 'ContractGraphCanvas',
  props: {
    modelValue: {
      type: Object as PropType<KotodamaStudioGraphDocumentV2['graph']>,
      required: true,
    },
    selectedNodeId: {
      type: String as PropType<string | null>,
      default: null,
    },
    diagnostics: {
      type: Array as PropType<KotodamaStudioGraphDiagnostic[]>,
      default: () => [],
    },
  },
  emits: ['update:modelValue', 'update:selectedNodeId'],
  setup(props, { emit, attrs }) {
    const selectKind = (kind: string) => {
      const node = props.modelValue.nodes.find((item) => item.data.kind === kind);
      emit('update:selectedNodeId', node?.id ?? null);
    };

    return () => h('div', {
      ...attrs,
      'data-test': attrs['data-test'] ?? 'studio-graph-canvas',
    }, [
      h('button', {
        'data-test': 'graph-select-entrypoint',
        onClick: () => selectKind('entrypoint'),
      }, 'Select entrypoint'),
      h('button', {
        'data-test': 'graph-select-effect',
        onClick: () => selectKind('effect'),
      }, 'Select effect'),
      h('button', {
        'data-test': 'graph-select-branch',
        onClick: () => selectKind('branch'),
      }, 'Select branch'),
      h('output', { 'data-test': 'graph-diagnostic-count' }, String(props.diagnostics.length)),
    ]);
  },
});

async function settle() {
  await flushPromises();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await flushPromises();
}

function findButtonByText(wrapper: ReturnType<typeof factory>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text);
  expect(button).toBeDefined();
  return button!;
}

function findFieldControl(wrapper: ReturnType<typeof factory>, label: string) {
  const field = wrapper.findAll('label').find((item) => item.text().includes(label));
  expect(field).toBeDefined();
  const control = field!.find('input, textarea, select');
  expect(control.exists()).toBe(true);
  return control;
}

function factory() {
  return mount(KotodamaStudio, {
    global: {
      plugins: [i18n],
      stubs: {
        ContractGraphCanvas: ContractGraphCanvasStub,
        BaseLoading: true,
        RouterLink: true,
      },
    },
  });
}

describe('KotodamaStudio', () => {
  beforeEach(() => {
    notifications.success.mockClear();
    notifications.error.mockClear();
    apiMocks.submitContractDeployRequest.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders graph-generated source and local compile details', async () => {
    const wrapper = factory();
    await settle();

    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('seiyaku StablecoinSimple');
    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('mint_stable');
    expect(wrapper.text()).toContain('2 entrypoints');

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-compile-mode"]').text()).toBe('graph-local-browser');
    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeDefined();
    expect(notifications.success).toHaveBeenCalledWith('Contract bundle compiled locally.');
  });

  it('requires a private key before enabling direct deploy', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-test="studio-direct-deploy-private-key"]').setValue('ed25519:priv');
    await settle();

    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeUndefined();
  });

  it('submits graph compile artifacts directly to Torii and clears the private key', async () => {
    apiMocks.submitContractDeployRequest.mockResolvedValue({
      ok: true,
      statusCode: 200,
      data: {
        ok: true,
        contract_address: 'tairac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9ggff82m7',
        dataspace: 'stable',
        deploy_nonce: 2,
        tx_hash_hex: '0xdirect123',
        code_hash_hex: 'aa'.repeat(32),
        abi_hash_hex: 'bb'.repeat(32),
      },
    });

    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="studio-direct-deploy-private-key"]').setValue('ed25519:priv');
    await settle();

    await wrapper.get('[data-test="studio-deploy"]').trigger('click');
    await settle();

    expect(apiMocks.submitContractDeployRequest).toHaveBeenCalledWith({
      authority: 'operator@stable.main',
      private_key: 'ed25519:priv',
      code_b64: expect.any(String),
      dataspace: 'stable',
    });
    expect(notifications.success).toHaveBeenCalledWith('Deploy submitted: 0xdirect123');
    expect((wrapper.get('[data-test="studio-direct-deploy-private-key"]').element as HTMLInputElement).value).toBe('');
  });

  it('switches templates and updates generated source from inspector edits', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="graph-select-entrypoint"]').trigger('click');
    await settle();

    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('collateral_amount');
    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('int');

    await wrapper.get('[data-test="studio-template-asset_ops"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('seiyaku AssetOps');

    await wrapper.get('[data-test="graph-select-entrypoint"]').trigger('click');
    await settle();

    expect((wrapper.get('[data-test="studio-node-title"]').element as HTMLInputElement).value).toBe('execute');

    await findFieldControl(wrapper, 'Entrypoint name').setValue('execute_assets');
    await settle();

    await wrapper.get('[data-test="studio-param-builder"] button').trigger('click');
    await settle();

    await wrapper.get('input[aria-label="Parameter name"]').setValue('asset');
    await settle();
    await wrapper.get('select[aria-label="Parameter type"]').setValue('AssetDefinitionId');
    await settle();

    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('kotoage fn execute_assets(asset: AssetDefinitionId)');
    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('asset');
    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('AssetDefinitionId');
  });

  it('edits branch edge labels from the inspector and persists the graph document', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      updatedAt: '2026-04-24T00:00:00.000Z',
      metadata: {
        title: 'BranchEditor',
        dataspace: 'branch',
        authority: 'operator@branch.main',
        chainId: 'wonderland',
        description: 'Edge editor fixture.',
      },
      legacy: null,
      graph: {
        nodes: [
          {
            id: 'entry-run',
            type: 'kotodamaGraph',
            position: { x: 80, y: 100 },
            data: {
              title: 'run',
              detail: 'Entrypoint',
              kind: 'entrypoint',
              config: { name: 'run', params: '', returnType: '', permission: '', access: '' },
              ports: [],
            },
          },
          {
            id: 'branch-check',
            type: 'kotodamaGraph',
            position: { x: 360, y: 100 },
            data: {
              title: 'check',
              detail: 'Branch',
              kind: 'branch',
              config: { condition: 'true' },
              ports: [],
            },
          },
          {
            id: 'effect-info',
            type: 'kotodamaGraph',
            position: { x: 640, y: 100 },
            data: {
              title: 'say',
              detail: 'Effect',
              kind: 'effect',
              config: { effect: 'info', args: '"branched"', statement: '' },
              ports: [],
            },
          },
        ],
        edges: [
          { id: 'edge-entry-branch-next', source: 'entry-run', target: 'branch-check', label: 'next' },
          { id: 'edge-branch-effect-then', source: 'branch-check', target: 'effect-info', label: 'then' },
        ],
      },
    }));

    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="graph-select-branch"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-edge-editor"]').text()).toContain('say');

    await wrapper.get('select[aria-label="Edge label"]').setValue('else');
    await settle();

    expect(localStorage.getItem(STORAGE_KEY)).toContain('"label": "else"');
    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('} else {\n      info("branched");');
  });

  it('adds palette nodes and blocks compile on typed validation diagnostics', async () => {
    const wrapper = factory();
    await settle();

    await findButtonByText(wrapper, 'State').trigger('click');
    await settle();
    await findButtonByText(wrapper, 'State').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-semantic-diagnostics"]').text()).toContain('State "counter" is defined more than once.');
    expect(wrapper.get('[data-test="studio-compile"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="graph-diagnostic-count"]').text()).toBe('2');
  });

  it('persists v2 graph state without private-key persistence', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="studio-direct-deploy-private-key"]').setValue('ed25519:super-secret');
    await settle();
    await wrapper.get('[data-test="studio-template-asset_ops"]').trigger('click');
    await settle();

    const storedDocument = localStorage.getItem(STORAGE_KEY);
    expect(storedDocument).toBeTruthy();
    expect(storedDocument).toContain('"version": 2');
    expect(storedDocument).toContain('"title": "AssetOps"');
    expect(storedDocument).not.toContain('ed25519:super-secret');
  });
});
