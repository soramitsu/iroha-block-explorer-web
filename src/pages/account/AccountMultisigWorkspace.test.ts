import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import AccountMultisigWorkspace from './AccountMultisigWorkspace.vue';
import { TORII_CANONICAL_REQUEST_DOMAIN_TAG } from '@/shared/lib/connect';

const apiMocks = vi.hoisted(() => ({
  fetchMultisigSpec: vi.fn(),
  fetchMultisigProposals: vi.fn(),
}));
const appSession = vi.hoisted(() => ({ close: vi.fn() }));
const canonicalSign = vi.hoisted(() => vi.fn());
const connectMocks = vi.hoisted(() => ({
  createConnectSessionPreview: vi.fn(),
  getConnectConfiguration: vi.fn(),
  registerConnectSession: vi.fn(),
  createConnectAppSession: vi.fn(),
  createConnectCanonicalRequestAuth: vi.fn(),
}));

vi.mock('@/shared/runtime-config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/runtime-config')>(),
  getRuntimeNetworkPrefix: () => 369,
}));

vi.mock('@/shared/api', () => ({
  fetchMultisigSpec: apiMocks.fetchMultisigSpec,
  fetchMultisigProposals: apiMocks.fetchMultisigProposals,
  getToriiBaseUrl: () => 'https://taira.sora.org',
}));

vi.mock('@/shared/lib/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/connect')>();
  return {
    ...actual,
    createConnectSessionPreview: connectMocks.createConnectSessionPreview,
    getConnectConfiguration: connectMocks.getConnectConfiguration,
    registerConnectSession: connectMocks.registerConnectSession,
    createConnectAppSession: connectMocks.createConnectAppSession,
    createConnectCanonicalRequestAuth: connectMocks.createConnectCanonicalRequestAuth,
  };
});

const MULTISIG_ACCOUNT =
  'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SIGNATORY = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const ASSET_DEFINITION = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const EXACT_AMOUNT = '90071992547409931234567890.000000000000000001';
const NETWORK_ID_LITERAL = '11'.repeat(32);
const NETWORK_ID = {
  literal: NETWORK_ID_LITERAL,
  toBytes: () => new Uint8Array(32).fill(0x11),
  toString: () => NETWORK_ID_LITERAL,
};
const AUTH = { authAccountId: SIGNATORY, sign: canonicalSign };
const PREVIEW = {
  sidBase64Url: 'preview-session',
  networkId: NETWORK_ID,
  node: 'https://taira.sora.org',
};
const SESSION = {
  sid: 'session-1',
  network_id: NETWORK_ID_LITERAL,
  app_pk: 'app-public-key',
  nonce: 'nonce',
  wallet_uri: 'irohaconnect://wallet/session-1',
  app_uri: 'irohaconnect://app/session-1',
  token_app: 'app-token',
  token_wallet: 'wallet-token',
  token_management: 'management-token',
  token_relay: 'relay-token',
};
const SPEC = {
  resolved_multisig_account_id: MULTISIG_ACCOUNT,
  spec: {
    signatories: { [SIGNATORY]: 2 },
    quorum: 2,
    transaction_ttl_ms: 86_400_000,
  },
};
const PROPOSAL = {
  proposal_id: 'a'.repeat(64),
  instructions_hash: 'b'.repeat(64),
  operation_type: 'TRANSFER_ASSET',
  intent: { memo: 'treasury payment' },
  proposal: {
    network_id: 'hash:5C3E66C94E079079FF4FC46F59810B9C4EC7B2646DD45CE937831C0FDCE20C9B#44D9',
    proposal_nonce: 'c'.repeat(64),
    proposal_id: 'a'.repeat(64),
    transaction_ttl_ms: null,
    instructions: [
      {
        Transfer: {
          Asset: {
            source: `${ASSET_DEFINITION}#${MULTISIG_ACCOUNT}`,
            object: EXACT_AMOUNT,
            destination: SIGNATORY,
          },
        },
      },
    ],
    proposed_at_ms: 1_725_000_000_123,
    expires_at_ms: 1_725_086_400_123,
    approvals: [SIGNATORY],
  },
  status: 'COLLECTING_SIGNATURES',
  terminal_at_ms: null,
};

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  props: { title: { type: String, default: '' } },
  template: '<section><h2>{{ title }}</h2><slot /></section>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  props: { disabled: { type: Boolean, default: false } },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
});

const BaseLinkStub = defineComponent({
  name: 'BaseLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
});

const BaseJsonStub = defineComponent({
  name: 'BaseJson',
  props: { value: { type: null, default: null } },
  template: '<pre class="base-json-stub">{{ JSON.stringify(value) }}</pre>',
});

const InstructionSemanticCardStub = defineComponent({
  name: 'InstructionSemanticCard',
  props: { presentation: { type: Object, required: true } },
  template: '<div data-test="semantic-instruction">{{ presentation.title }}</div>',
});

async function factory(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/account', component: { template: '<div />' } }],
  });
  await router.push({ path: '/account', query });
  await router.isReady();

  const wrapper = mount(AccountMultisigWorkspace, {
    props: { accountId: MULTISIG_ACCOUNT },
    global: {
      plugins: [router],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseJson: BaseJsonStub,
        BaseLink: BaseLinkStub,
        BaseLoading: { template: '<span>spinner</span>' },
        InstructionSemanticCard: InstructionSemanticCardStub,
      },
    },
  });
  await flushPromises();
  return { router, wrapper };
}

async function connectAndAuthenticate(wrapper: VueWrapper) {
  await wrapper.get('[data-test="multisig-create-session"]').trigger('click');
  await flushPromises();
  await wrapper.get('[data-test="multisig-authenticate"]').trigger('click');
  await flushPromises();
}

function proposalsResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    data: {
      resolved_multisig_account_id: MULTISIG_ACCOUNT,
      proposals: [PROPOSAL],
      next_cursor: 'next-page-token',
      ...overrides,
    },
  };
}

describe('AccountMultisigWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchMultisigSpec.mockResolvedValue({ status: 'ok', data: SPEC });
    apiMocks.fetchMultisigProposals.mockResolvedValue(proposalsResponse());
    connectMocks.getConnectConfiguration.mockReturnValue({
      available: true,
      literal: NETWORK_ID_LITERAL,
      networkId: NETWORK_ID,
    });
    connectMocks.createConnectSessionPreview.mockReturnValue(PREVIEW);
    connectMocks.registerConnectSession.mockResolvedValue(SESSION);
    connectMocks.createConnectAppSession.mockReturnValue(appSession);
    connectMocks.createConnectCanonicalRequestAuth.mockResolvedValue(AUTH);
  });

  it('performs only signed reads and renders server-provided spec, approvals, expiry, and decoded instructions', async () => {
    const { router, wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(connectMocks.createConnectSessionPreview).toHaveBeenCalledWith({
      networkId: NETWORK_ID,
      node: 'https://taira.sora.org',
    });
    expect(connectMocks.registerConnectSession).toHaveBeenCalledWith(
      'https://taira.sora.org',
      PREVIEW,
      { node: 'https://taira.sora.org' }
    );
    expect(connectMocks.createConnectAppSession).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: {
          methods: ['sign_raw'],
          resources: [TORII_CANONICAL_REQUEST_DOMAIN_TAG],
        },
      })
    );
    expect(connectMocks.createConnectCanonicalRequestAuth).toHaveBeenCalledWith(appSession);
    expect(apiMocks.fetchMultisigSpec).toHaveBeenCalledWith(MULTISIG_ACCOUNT, AUTH);
    expect(apiMocks.fetchMultisigProposals).toHaveBeenCalledWith(
      MULTISIG_ACCOUNT,
      { status: undefined, cursor: null, limit: 20 },
      AUTH
    );
    expect(apiMocks.fetchMultisigSpec.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.fetchMultisigProposals.mock.invocationCallOrder[0] ?? 0
    );

    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain('server-provided, unverified');
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain('Role: Signatory');
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain('Weight: 2');
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain('86400000 ms');
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain('COLLECTING_SIGNATURES');
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain('1725086400123 ms');
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain(SIGNATORY);
    expect(wrapper.get('[data-test="semantic-instruction"]').text()).toBe('Asset transfer');
    expect(wrapper.get('.base-json-stub').text()).toContain('treasury payment');

    const actionLabels = wrapper.findAll('button').map((button) => button.text().trim());
    expect(actionLabels).not.toContain('Approve');
    expect(actionLabels).not.toContain('Reject');
    expect(actionLabels).not.toContain('Cancel');
    expect(actionLabels).not.toContain('Submit');

    await wrapper.get('[data-test="multisig-status-filter"]').setValue('FINALIZED');
    await flushPromises();
    expect(router.currentRoute.value.query.multisig_status).toBe('FINALIZED');
    expect(apiMocks.fetchMultisigProposals).toHaveBeenLastCalledWith(
      MULTISIG_ACCOUNT,
      { status: ['FINALIZED'], cursor: null, limit: 20 },
      AUTH
    );

    await wrapper.get('[data-test="multisig-next-page"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.multisig_cursor).toBe('next-page-token');

    wrapper.unmount();
    expect(appSession.close).toHaveBeenCalledWith('multisig workspace closed');
  });

  it('keeps permission denial distinct and does not query proposals after a denied spec read', async () => {
    apiMocks.fetchMultisigSpec.mockResolvedValue({
      status: 'permission-denied',
      error: new Error('reader lacks multisig visibility'),
    });
    const { wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(wrapper.get('[data-test="multisig-permission-denied"]').text()).toContain(
      'reader lacks multisig visibility'
    );
    expect(apiMocks.fetchMultisigProposals).not.toHaveBeenCalled();
  });

  it('renders a successful empty proposal query without inferring any required subset', async () => {
    apiMocks.fetchMultisigProposals.mockResolvedValue(
      proposalsResponse({ proposals: [], next_cursor: null })
    );
    const { wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(wrapper.get('[data-test="multisig-empty"]').text()).toContain('No proposals match');
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain(
      'does not infer which subset is required'
    );
  });

  it('fails closed when spec and proposal queries resolve to different accounts', async () => {
    apiMocks.fetchMultisigProposals.mockResolvedValue(
      proposalsResponse({ resolved_multisig_account_id: SIGNATORY })
    );
    const { wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(wrapper.get('[data-test="multisig-workspace-error"]').text()).toContain(
      'different resolved account IDs'
    );
    expect(wrapper.find('[data-test="multisig-spec"]').exists()).toBe(false);
  });

  it('waits for the signed spec before a URL filter change can start the proposal query', async () => {
    let resolveSpec: ((value: { status: string, data: typeof SPEC }) => void) | undefined;
    apiMocks.fetchMultisigSpec.mockImplementation(
      () => new Promise((resolve) => {
        resolveSpec = resolve;
      })
    );
    const { router, wrapper } = await factory();

    await wrapper.get('[data-test="multisig-create-session"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-test="multisig-authenticate"]').trigger('click');
    await flushPromises();
    await router.replace({
      query: { multisig_status: 'FINALIZED' },
    });
    await flushPromises();

    expect(apiMocks.fetchMultisigProposals).not.toHaveBeenCalled();

    resolveSpec?.({ status: 'ok', data: SPEC });
    await flushPromises();

    expect(apiMocks.fetchMultisigProposals).toHaveBeenCalledWith(
      MULTISIG_ACCOUNT,
      { status: ['FINALIZED'], cursor: null, limit: 20 },
      AUTH
    );
  });

  it('fails closed without an exact runtime NetworkId and dispatches no Connect request', async () => {
    connectMocks.getConnectConfiguration.mockReturnValue({
      available: false,
      error: new Error('Connect is disabled until an exact Iroha NetworkId is configured.'),
    });
    const unavailable = await factory();
    expect(unavailable.wrapper.find('[data-test="multisig-connect-unavailable"]').exists()).toBe(true);
    expect(unavailable.wrapper.find('[data-test="multisig-create-session"]').exists()).toBe(false);
    expect(unavailable.wrapper.text()).toContain('exact Iroha NetworkId');
    expect(connectMocks.createConnectSessionPreview).not.toHaveBeenCalled();
    expect(connectMocks.registerConnectSession).not.toHaveBeenCalled();
  });
});
