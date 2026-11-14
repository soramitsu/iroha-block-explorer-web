import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, type PropType } from 'vue';
import { i18n } from '@/shared/lib/localization';
import type { KotodamaStudioGraphDiagnostic, KotodamaStudioGraphDocumentV2 } from '@/shared/lib/kotodama-studio-graph';
import KotodamaStudio from './KotodamaStudio.vue';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const compilerMocks = vi.hoisted(() => ({
  compilerUrl: 'https://compiler.example' as string | null,
  compileKotodamaStudioSource: vi.fn(),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/lib/kotodama-studio-compiler-config', () => ({
  getKotodamaCompilerUrl: () => compilerMocks.compilerUrl,
}));

vi.mock('@/shared/lib/kotodama-studio-deploy', () => ({
  compileKotodamaStudioSource: compilerMocks.compileKotodamaStudioSource,
}));

const STORAGE_KEY = 'kotodama_studio_graph_document_v2';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

function createCompileResult(codeHashHex = 'aa'.repeat(32)) {
  return {
    artifactLabel: '.to bundle',
    artifactB64: 'AQIDBA==',
    codeHashHex,
    abiHashHex: 'bb'.repeat(32),
    compilerFingerprint: 'kotodama_lang/current-rust',
    diagnostics: [],
    warnings: [],
    manifest: { seiyaku_name: 'StudioGraph' },
    sourceMap: [],
    budgetReport: [],
    summary: { states: [], entrypoints: [], triggers: [] },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

    return () =>
      h(
        'div',
        {
          ...attrs,
          'data-test': attrs['data-test'] ?? 'studio-graph-canvas',
        },
        [
          h(
            'button',
            {
              'data-test': 'graph-select-entrypoint',
              onClick: () => selectKind('entrypoint'),
            },
            'Select entrypoint'
          ),
          h(
            'button',
            {
              'data-test': 'graph-select-effect',
              onClick: () => selectKind('effect'),
            },
            'Select effect'
          ),
          h(
            'button',
            {
              'data-test': 'graph-select-branch',
              onClick: () => selectKind('branch'),
            },
            'Select branch'
          ),
          h('output', { 'data-test': 'graph-diagnostic-count' }, String(props.diagnostics.length)),
        ]
      );
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
    vi.stubGlobal('localStorage', createMemoryStorage());
    notifications.success.mockClear();
    notifications.error.mockClear();
    compilerMocks.compilerUrl = 'https://compiler.example';
    compilerMocks.compileKotodamaStudioSource.mockReset().mockResolvedValue(createCompileResult());
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('renders graph-generated source and canonical Rust compile details', async () => {
    const wrapper = factory();
    await settle();

    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('seiyaku StablecoinSimple');
    expect(wrapper.get('[data-test="studio-source"]').text()).toContain('mint_stable');
    expect(wrapper.text()).toContain('2 entrypoints');

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-compile-mode"]').text()).toBe('canonical-rust-service');
    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeDefined();
    expect(compilerMocks.compileKotodamaStudioSource).toHaveBeenCalledWith(
      expect.objectContaining({
        compilerUrl: 'https://compiler.example',
        source: expect.stringContaining('seiyaku StablecoinSimple'),
      })
    );
    expect(notifications.success).toHaveBeenCalledWith('Contract bundle compiled by the canonical Rust service.');
  });

  it('fails closed when no trusted compiler service URL is configured', async () => {
    compilerMocks.compilerUrl = null;
    const wrapper = factory();
    await settle();

    expect(wrapper.get('[data-test="studio-compile"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).toContain(
      'Compilation is disabled until an operator configures a trusted canonical Rust compiler service URL.'
    );
    expect(compilerMocks.compileKotodamaStudioSource).not.toHaveBeenCalled();
  });

  it('keeps deployment visibly unavailable without accepting a signing credential', async () => {
    const wrapper = factory();
    await settle();

    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="studio-deployment-unavailable"]').text()).toContain(
      'does not provide an approved browser signing and submission API'
    );
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-deploy"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
  });

  it('renders canonical Rust source diagnostics at their graph location', async () => {
    compilerMocks.compileKotodamaStudioSource.mockResolvedValue({
      artifactLabel: '.to bundle',
      artifactB64: '',
      codeHashHex: '',
      abiHashHex: '',
      compilerFingerprint: '',
      diagnostics: [
        {
          code: 'EK_PARSE',
          severity: 'error',
          phase: 'parse',
          message: 'Unexpected token',
          primary_span: {
            source: 'studio.ko',
            start: { line: 3, column: 5 },
            end: { line: 3, column: 6 },
            byte_range: { start: 10, end: 11 },
          },
          labels: [],
          notes: [],
          help: null,
          fix: null,
        },
      ],
      warnings: [],
      manifest: null,
      sourceMap: [],
      budgetReport: [],
      summary: { states: [], entrypoints: [], triggers: [] },
    });
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-semantic-diagnostics"]').text()).toContain(
      'Line 3, column 5: Unexpected token'
    );
    expect(notifications.error).toHaveBeenCalledWith('The canonical Rust compiler found problems.');
    expect(wrapper.find('[data-test="studio-direct-deploy-private-key"]').exists()).toBe(false);
  });

  it('surfaces compiler-service transport failures separately from source diagnostics', async () => {
    compilerMocks.compileKotodamaStudioSource.mockRejectedValue(
      new Error('Kotodama compiler service failed (503): unavailable')
    );
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await settle();

    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).toContain(
      'Unable to compile the graph-generated source.'
    );
    expect(notifications.error).toHaveBeenCalledWith('Unable to compile the graph-generated source.');
    expect(wrapper.find('[data-test="studio-compile-mode"]').exists()).toBe(false);
  });

  it('discards a compiler response when the graph is edited while the request is awaiting', async () => {
    const pendingCompile = createDeferred<ReturnType<typeof createCompileResult>>();
    compilerMocks.compileKotodamaStudioSource.mockReturnValueOnce(pendingCompile.promise);
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await flushPromises();
    expect(compilerMocks.compileKotodamaStudioSource).toHaveBeenCalledTimes(1);

    await findFieldControl(wrapper, 'Contract title').setValue('EditedWhileCompiling');
    await settle();
    pendingCompile.resolve(createCompileResult('11'.repeat(32)));
    await settle();

    expect(wrapper.find('[data-test="studio-compile-mode"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).not.toContain('11'.repeat(32));
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('keeps the newest compile authoritative when responses arrive out of order', async () => {
    const firstCompile = createDeferred<ReturnType<typeof createCompileResult>>();
    const secondCompile = createDeferred<ReturnType<typeof createCompileResult>>();
    compilerMocks.compileKotodamaStudioSource
      .mockReturnValueOnce(firstCompile.promise)
      .mockReturnValueOnce(secondCompile.promise);
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await flushPromises();
    await findFieldControl(wrapper, 'Contract title').setValue('NewerSource');
    await settle();
    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await flushPromises();

    secondCompile.resolve(createCompileResult('22'.repeat(32)));
    await settle();
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).toContain('22'.repeat(32));

    firstCompile.resolve(createCompileResult('11'.repeat(32)));
    await settle();
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).toContain('22'.repeat(32));
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).not.toContain('11'.repeat(32));
    expect(notifications.success).toHaveBeenCalledTimes(1);
  });

  it('discards a response when the configured compiler service changes during the request', async () => {
    const pendingCompile = createDeferred<ReturnType<typeof createCompileResult>>();
    compilerMocks.compileKotodamaStudioSource.mockReturnValueOnce(pendingCompile.promise);
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-compile"]').trigger('click');
    await flushPromises();
    compilerMocks.compilerUrl = 'https://new-compiler.example';
    pendingCompile.resolve(createCompileResult('33'.repeat(32)));
    await settle();

    expect(wrapper.find('[data-test="studio-compile-mode"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="studio-compile-panel"]').text()).not.toContain('33'.repeat(32));
    expect(wrapper.find('.kotodama-studio__loading').exists()).toBe(false);
    expect(notifications.success).not.toHaveBeenCalled();
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

    expect(wrapper.get('[data-test="studio-source"]').text()).toContain(
      'kotoage fn execute_assets(asset: AssetDefinitionId)'
    );
    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('asset');
    expect(wrapper.get('.kotodama-studio__ports').text()).toContain('AssetDefinitionId');
  });

  it('edits branch edge labels from the inspector and persists the graph document', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        updatedAt: '2026-04-24T00:00:00.000Z',
        metadata: {
          title: 'BranchEditor',
          dataspace: 'branch',
          authority: 'operator@branch.main',
          chainId: 'wonderland',
          description: 'Edge editor fixture.',
        },
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
      })
    );

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

    expect(wrapper.get('[data-test="studio-semantic-diagnostics"]').text()).toContain(
      'State "counter" is defined more than once.'
    );
    expect(wrapper.get('[data-test="studio-compile"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="graph-diagnostic-count"]').text()).toBe('2');
  });

  it('persists v2 graph state without a browser credential surface', async () => {
    const wrapper = factory();
    await settle();

    await wrapper.get('[data-test="studio-template-asset_ops"]').trigger('click');
    await settle();

    const storedDocument = localStorage.getItem(STORAGE_KEY);
    expect(storedDocument).toBeTruthy();
    expect(storedDocument).toContain('"version": 2');
    expect(storedDocument).toContain('"title": "AssetOps"');
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
  });
});
