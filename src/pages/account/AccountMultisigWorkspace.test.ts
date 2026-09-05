import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { LocationQueryRaw } from 'vue-router';
import { defineComponent } from 'vue';
import { NetworkId } from '@iroha/iroha-js/browser';
import AccountMultisigWorkspace from './AccountMultisigWorkspace.vue';
import { TORII_CANONICAL_REQUEST_DOMAIN_TAG } from '@/shared/lib/connect';
import { i18n } from '@/shared/lib/localization';

const apiMocks = vi.hoisted(() => ({
  createConnectSession: vi.fn(),
  fetchMultisigSpec: vi.fn(),
  fetchMultisigProposals: vi.fn(),
}));
const appSession = vi.hoisted(() => ({ close: vi.fn() }));
const canonicalSign = vi.hoisted(() => vi.fn());
const connectMocks = vi.hoisted(() => ({
  createConnectSessionPreview: vi.fn(),
  createConnectAppSession: vi.fn(),
  createConnectCanonicalRequestAuth: vi.fn(),
}));
const runtimeConfigState = vi.hoisted((): { value: Record<string, unknown> } => ({ value: {} }));

vi.mock('@/shared/runtime-config', () => ({
  getRuntimeConfig: () => runtimeConfigState.value,
}));

vi.mock('@/shared/api', () => ({
  createConnectSession: apiMocks.createConnectSession,
  fetchMultisigSpec: apiMocks.fetchMultisigSpec,
  fetchMultisigProposals: apiMocks.fetchMultisigProposals,
  getToriiBaseUrl: () => 'https://taira.sora.org',
}));

vi.mock('@/shared/lib/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/connect')>();
  return {
    ...actual,
    createConnectSessionPreview: connectMocks.createConnectSessionPreview,
    createConnectAppSession: connectMocks.createConnectAppSession,
    createConnectCanonicalRequestAuth: connectMocks.createConnectCanonicalRequestAuth,
  };
});

const MULTISIG_ACCOUNT = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SIGNATORY = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const ASSET_DEFINITION = '66owaQmAQMuHxPzxUN3bqZ6FJfDa';
const EXACT_AMOUNT = '90071992547409931234567890.000000000000000001';
const NETWORK_ID_LITERAL = 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0';
const NETWORK_ID = NetworkId.parse(NETWORK_ID_LITERAL);
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
  nonce: 'session-nonce',
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
    is_relayed: false,
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
  template: '<div data-test="semantic-instruction">{{ presentation.title.key }}</div>',
});

async function factory(query: LocationQueryRaw = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/account', component: { template: '<div />' } }],
  });
  await router.push({ path: '/account', query });
  await router.isReady();

  const wrapper = mount(AccountMultisigWorkspace, {
    props: { accountId: MULTISIG_ACCOUNT },
    global: {
      plugins: [router, i18n],
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
    runtimeConfigState.value = { networkId: NETWORK_ID_LITERAL };
    apiMocks.createConnectSession.mockResolvedValue({ status: 'ok', data: SESSION });
    apiMocks.fetchMultisigSpec.mockResolvedValue({ status: 'ok', data: SPEC });
    apiMocks.fetchMultisigProposals.mockResolvedValue(proposalsResponse());
    connectMocks.createConnectSessionPreview.mockReturnValue(PREVIEW);
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
    expect(apiMocks.createConnectSession).toHaveBeenCalledWith(PREVIEW);
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
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain(
      i18n.global.t('units.milliseconds', { value: SPEC.spec.transaction_ttl_ms })
    );
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain('Collecting signatures');
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain(
      i18n.global.t('units.milliseconds', { value: PROPOSAL.proposal.expires_at_ms })
    );
    expect(wrapper.get('[data-test="multisig-proposal"]').text()).toContain(SIGNATORY);
    expect(wrapper.get('[data-test="semantic-instruction"]').text()).toBe(
      'studio.instructionPresentation.titles.Transfer_Asset'
    );
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
      'Torii denied this authenticated multisig read'
    );
    expect(wrapper.get('[data-test="multisig-permission-denied"]').text()).not.toContain(
      'reader lacks multisig visibility'
    );
    expect(apiMocks.fetchMultisigProposals).not.toHaveBeenCalled();
  });

  it('renders a successful empty proposal query without inferring any required subset', async () => {
    apiMocks.fetchMultisigProposals.mockResolvedValue(proposalsResponse({ proposals: [], next_cursor: null }));
    const { wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(wrapper.get('[data-test="multisig-empty"]').text()).toContain('No proposals match');
    expect(wrapper.get('[data-test="multisig-spec"]').text()).toContain('does not infer which subset is required');
  });

  it('fails closed when spec and proposal queries resolve to different accounts', async () => {
    apiMocks.fetchMultisigProposals.mockResolvedValue(proposalsResponse({ resolved_multisig_account_id: SIGNATORY }));
    const { wrapper } = await factory();

    await connectAndAuthenticate(wrapper);

    expect(wrapper.get('[data-test="multisig-workspace-error"]').text()).toContain('different resolved account IDs');
    expect(wrapper.find('[data-test="multisig-spec"]').exists()).toBe(false);
  });

  it('waits for the signed spec before a URL filter change can start the proposal query', async () => {
    let resolveSpec: ((value: { status: string; data: typeof SPEC }) => void) | undefined;
    apiMocks.fetchMultisigSpec.mockImplementation(
      () =>
        new Promise((resolve) => {
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

  it.each([
    ['unknown status', { multisig_status: 'NOT_A_STATUS' }],
    ['duplicate status', { multisig_status: ['FINALIZED', 'CANCELED'] }],
    ['empty cursor', { multisig_cursor: '' }],
    ['padded cursor', { multisig_cursor: 'padded=' }],
    ['duplicate cursor', { multisig_cursor: ['cursor-a', 'cursor-b'] }],
    ['oversized cursor', { multisig_cursor: 'a'.repeat(513) }],
  ])('does not broaden an invalid %s bookmark into a signed proposal query', async (_label, query) => {
    const { wrapper } = await factory(query);

    await connectAndAuthenticate(wrapper);

    expect(apiMocks.fetchMultisigSpec).toHaveBeenCalledWith(MULTISIG_ACCOUNT, AUTH);
    expect(apiMocks.fetchMultisigProposals).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="multisig-invalid-route"]').text()).toContain('Unsupported search query');
    expect(wrapper.find('[data-test="multisig-spec"]').exists()).toBe(false);
  });

  it('queries the canonical all-status first page only after explicit invalid-route recovery', async () => {
    const { router, wrapper } = await factory({
      multisig_status: ['FINALIZED', 'CANCELED'],
      multisig_cursor: 'padded=',
    });
    await connectAndAuthenticate(wrapper);
    expect(apiMocks.fetchMultisigProposals).not.toHaveBeenCalled();

    await wrapper.get('[data-test="multisig-clear-invalid-route"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.multisig_status).toBeUndefined();
    expect(router.currentRoute.value.query.multisig_cursor).toBeUndefined();
    expect(apiMocks.fetchMultisigProposals).toHaveBeenCalledWith(
      MULTISIG_ACCOUNT,
      { status: undefined, cursor: null, limit: 20 },
      AUTH
    );
    expect(wrapper.find('[data-test="multisig-invalid-route"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="multisig-spec"]').exists()).toBe(true);
  });

  it('does not offer a session when the exact NetworkId is unconfigured', async () => {
    runtimeConfigState.value = {};
    const noNetwork = await factory();
    expect(noNetwork.wrapper.find('[data-test="multisig-create-session"]').exists()).toBe(false);
    expect(apiMocks.createConnectSession).not.toHaveBeenCalled();
    expect(noNetwork.wrapper.get('[data-test="multisig-network-unconfigured"]').text()).toContain(
      'never derives network identity'
    );
  });

  it('discovers Connect availability by creating a session and surfaces a rejected bootstrap', async () => {
    apiMocks.createConnectSession.mockResolvedValue({
      status: 'error',
      error: new Error('Connect session endpoint is disabled'),
    });
    const { wrapper } = await factory();

    await wrapper.get('[data-test="multisig-create-session"]').trigger('click');
    await flushPromises();

    expect(apiMocks.createConnectSession).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('The Connect session could not be created.');
    expect(wrapper.text()).not.toContain('Connect session endpoint is disabled');
  });
});
