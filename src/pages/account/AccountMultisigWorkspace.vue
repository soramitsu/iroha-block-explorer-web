<script setup lang="ts">
import { getRuntimeNetworkPrefix } from '@/shared/runtime-config';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as http from '@/shared/api';
import { getRuntimeConfig } from '@/shared/runtime-config';
import type {
  ConnectSessionResponse,
  MultisigProposalStatus,
  MultisigProposalsQueryResponse,
  MultisigSpecResponse,
} from '@/shared/api/schemas';
import { MultisigProposalsSearchParamsSchema } from '@/shared/api/schemas';
import {
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  createConnectAppSession,
  createConnectCanonicalRequestAuth,
  createConnectSessionPreview,
  TORII_CANONICAL_REQUEST_DOMAIN_TAG,
  type ConnectAppSession,
  type ConnectCanonicalRequestAuth,
  type ConnectSessionPreview,
} from '@/shared/lib/connect';
import { buildDecodedInstructionPresentation } from '@/shared/lib/instruction-presentation';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import InstructionSemanticCard from '@/shared/ui/components/InstructionSemanticCard.vue';
import { useRouteQueryState } from '@/shared/ui/composables/useRouteQueryState';

const networkPrefix = getRuntimeNetworkPrefix();
const props = defineProps<{
  accountId: string;
}>();
const { t } = useI18n();

type StatusFilter = 'ALL' | MultisigProposalStatus;
type WorkspaceState =
  | 'idle'
  | 'waiting-for-wallet'
  | 'loading'
  | 'ready'
  | 'not-found'
  | 'permission-denied'
  | 'wallet-rejected'
  | 'session-closed'
  | 'error';

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'COLLECTING_SIGNATURES', 'FINALIZED', 'CANCELED', 'EXPIRED'];
const STATUS_MESSAGE_KEYS = {
  ALL: 'accounts.multisigWorkspace.statuses.all',
  COLLECTING_SIGNATURES: 'accounts.multisigWorkspace.statuses.collectingSignatures',
  FINALIZED: 'accounts.multisigWorkspace.statuses.finalized',
  CANCELED: 'accounts.multisigWorkspace.statuses.canceled',
  EXPIRED: 'accounts.multisigWorkspace.statuses.expired',
} as const satisfies Record<StatusFilter, string>;
const STATUS_FILTER_VALUES = new Set<StatusFilter>(STATUS_FILTERS);
const PROPOSAL_LIMIT = 20;
const networkIdLiteral = getRuntimeConfig().networkId ?? null;
const networkId = networkIdLiteral ? NetworkId.parse(networkIdLiteral) : null;

const { route, updateRouteQuery } = useRouteQueryState();
const proposalRouteState = computed(() => {
  const rawStatus = route.query.multisig_status;
  const rawCursor = route.query.multisig_cursor;
  const statusFilter: StatusFilter = rawStatus === undefined ? 'ALL' : (rawStatus as StatusFilter);
  if (
    (rawStatus !== undefined &&
      (typeof rawStatus !== 'string' || rawStatus === 'ALL' || !STATUS_FILTER_VALUES.has(statusFilter))) ||
    (rawCursor !== undefined && typeof rawCursor !== 'string')
  ) {
    return { ok: false as const };
  }

  const request = MultisigProposalsSearchParamsSchema.safeParse({
    status: statusFilter === 'ALL' ? undefined : [statusFilter],
    cursor: rawCursor === undefined ? null : rawCursor,
    limit: PROPOSAL_LIMIT,
  });
  if (!request.success) return { ok: false as const };
  return { ok: true as const, statusFilter, request: request.data };
});
const statusFilter = computed<StatusFilter>({
  get: () => (proposalRouteState.value.ok ? proposalRouteState.value.statusFilter : 'ALL'),
  set: (value) => {
    updateRouteQuery(
      {
        multisig_status: value === 'ALL' ? null : value,
        multisig_cursor: null,
      },
      { history: 'replace' }
    ).catch(() => {});
  },
});
const cursor = computed(() => (proposalRouteState.value.ok ? (proposalRouteState.value.request.cursor ?? null) : null));

const preview = shallowRef<ConnectSessionPreview | null>(null);
const sessionResponse = shallowRef<ConnectSessionResponse | null>(null);
const canonicalAuth = shallowRef<ConnectCanonicalRequestAuth | null>(null);
const approvedAccountId = ref<string | null>(null);
const spec = shallowRef<MultisigSpecResponse | null>(null);
const proposalsResponse = shallowRef<MultisigProposalsQueryResponse | null>(null);
const workspaceState = ref<WorkspaceState>('idle');
const sessionErrorKey = ref<string | null>(null);
const workspaceErrorKey = ref('accounts.multisigWorkspace.loadError');
const isCreatingSession = ref(false);
let appSession: ConnectAppSession | null = null;
let workspaceGeneration = 0;
let proposalRequestGeneration = 0;

const canCreateSession = computed(() => Boolean(networkId && !isCreatingSession.value));
const signatories = computed(() => Object.entries(spec.value?.spec.signatories ?? {}));

function formatProposalStatus(status: StatusFilter): string {
  return t(STATUS_MESSAGE_KEYS[status]);
}

function closeAppSession(reason = 'multisig workspace closed') {
  workspaceGeneration += 1;
  proposalRequestGeneration += 1;
  appSession?.close(reason);
  appSession = null;
  canonicalAuth.value = null;
  approvedAccountId.value = null;
}

async function createWalletSession() {
  if (!canCreateSession.value) return;

  closeAppSession('starting a new multisig read session');
  const generation = workspaceGeneration;
  preview.value = null;
  sessionResponse.value = null;
  spec.value = null;
  proposalsResponse.value = null;
  workspaceState.value = 'idle';
  sessionErrorKey.value = null;
  workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
  isCreatingSession.value = true;

  try {
    const toriiBaseUrl = http.getToriiBaseUrl();
    const createdPreview = createConnectSessionPreview({
      networkId: networkId!,
      node: toriiBaseUrl,
    });
    const result = await http.createConnectSession(createdPreview);
    if (generation !== workspaceGeneration) return;

    if (result.status !== SUCCESSFUL_FETCHING) {
      sessionErrorKey.value =
        result.status === 'not-found'
          ? 'accounts.multisigWorkspace.sessionUnavailable'
          : 'accounts.multisigWorkspace.sessionError';
      return;
    }

    preview.value = createdPreview;
    sessionResponse.value = result.data;
  } catch {
    if (generation !== workspaceGeneration) return;
    sessionErrorKey.value = 'accounts.multisigWorkspace.sessionError';
  } finally {
    if (generation === workspaceGeneration) isCreatingSession.value = false;
  }
}

async function loadProposals(generation = workspaceGeneration) {
  if (!canonicalAuth.value || !spec.value || generation !== workspaceGeneration) return;
  const routeState = proposalRouteState.value;
  if (!routeState.ok) {
    proposalRequestGeneration += 1;
    proposalsResponse.value = null;
    return;
  }

  const requestGeneration = ++proposalRequestGeneration;
  workspaceState.value = 'loading';
  workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
  try {
    const result = await http.fetchMultisigProposals(props.accountId, routeState.request, canonicalAuth.value);
    if (generation !== workspaceGeneration || requestGeneration !== proposalRequestGeneration) return;

    if (result.status === 'permission-denied') {
      workspaceState.value = 'permission-denied';
      return;
    }
    if (result.status === 'not-found') {
      workspaceState.value = 'not-found';
      return;
    }
    if (result.status !== SUCCESSFUL_FETCHING) {
      workspaceState.value = 'error';
      workspaceErrorKey.value = 'accounts.multisigWorkspace.proposalError';
      return;
    }
    if (spec.value && result.data.resolved_multisig_account_id !== spec.value.resolved_multisig_account_id) {
      workspaceState.value = 'error';
      workspaceErrorKey.value = 'accounts.multisigWorkspace.accountMismatch';
      return;
    }

    proposalsResponse.value = result.data;
    workspaceState.value = 'ready';
  } catch {
    if (generation !== workspaceGeneration || requestGeneration !== proposalRequestGeneration) return;
    workspaceState.value = 'error';
    workspaceErrorKey.value = 'accounts.multisigWorkspace.proposalError';
  }
}

async function authenticateAndLoad() {
  if (!preview.value || !sessionResponse.value) return;

  closeAppSession('re-authenticating multisig reads');
  const generation = workspaceGeneration;
  workspaceState.value = 'waiting-for-wallet';
  workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
  appSession = createConnectAppSession({
    baseUrl: http.getToriiBaseUrl(),
    preview: preview.value,
    session: sessionResponse.value,
    permissions: {
      methods: ['sign_raw'],
      resources: [TORII_CANONICAL_REQUEST_DOMAIN_TAG],
    },
    appMeta: {
      name: t('accounts.multisigWorkspace.walletAppName'),
      url: typeof window === 'undefined' ? null : window.location.origin,
    },
  });

  try {
    const auth = await createConnectCanonicalRequestAuth(appSession);
    if (generation !== workspaceGeneration) return;
    canonicalAuth.value = auth;
    approvedAccountId.value = auth.authAccountId;
    workspaceState.value = 'loading';

    const specResult = await http.fetchMultisigSpec(props.accountId, auth);
    if (generation !== workspaceGeneration) return;
    if (specResult.status === 'permission-denied') {
      workspaceState.value = 'permission-denied';
      return;
    }
    if (specResult.status === 'not-found') {
      workspaceState.value = 'not-found';
      return;
    }
    if (specResult.status !== SUCCESSFUL_FETCHING) {
      workspaceState.value = 'error';
      workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
      return;
    }

    spec.value = specResult.data;
    await loadProposals(generation);
  } catch (error) {
    if (generation !== workspaceGeneration) return;
    if (error instanceof ConnectApprovalRejectedError) {
      workspaceState.value = 'wallet-rejected';
      return;
    }
    if (error instanceof ConnectSessionClosedError) {
      workspaceState.value = 'session-closed';
      return;
    }
    if (error instanceof ConnectSignRequestError) {
      workspaceState.value = 'error';
      workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
      return;
    }

    workspaceState.value = 'error';
    workspaceErrorKey.value = 'accounts.multisigWorkspace.loadError';
  }
}

watch(proposalRouteState, () => {
  if (canonicalAuth.value) loadProposals();
});

function clearInvalidProposalRoute() {
  updateRouteQuery(
    {
      multisig_status: null,
      multisig_cursor: null,
    },
    { history: 'replace' }
  ).catch(() => {});
}

watch(
  () => props.accountId,
  () => {
    closeAppSession('multisig account changed');
    preview.value = null;
    sessionResponse.value = null;
    spec.value = null;
    proposalsResponse.value = null;
    workspaceState.value = 'idle';
    isCreatingSession.value = false;
  }
);

onBeforeUnmount(() => closeAppSession());
</script>

<template>
  <div class="account-multisig">
    <BaseContentBlock :title="$t('accounts.multisigWorkspace.title')">
      <template #default>
        <div class="account-multisig__connect">
          <p class="row-text">
            {{
              $t('accounts.multisigWorkspace.signedReadDescription', {
                signRaw: 'sign_raw',
                domainTag: TORII_CANONICAL_REQUEST_DOMAIN_TAG,
              })
            }}
          </p>

          <div
            v-if="!networkId"
            class="account-multisig__state row-text"
            role="status"
            data-test="multisig-network-unconfigured"
          >
            {{ $t('accounts.multisigWorkspace.networkDescription', { configFile: 'config.json' }) }}
          </div>
          <div v-else class="account-multisig__actions">
            <BaseButton
              bordered
              data-test="multisig-create-session"
              :disabled="!canCreateSession"
              @click="createWalletSession"
            >
              {{
                isCreatingSession
                  ? $t('accounts.multisigWorkspace.creatingSession')
                  : $t('accounts.multisigWorkspace.createSession')
              }}
            </BaseButton>
          </div>

          <p v-if="sessionErrorKey" class="account-multisig__error row-text" role="alert">
            {{ $t(sessionErrorKey) }}
          </p>

          <div v-if="sessionResponse" class="account-multisig__session" data-test="multisig-session">
            <div>
              <strong>{{ $t('accounts.multisigWorkspace.sessionId') }}</strong>
              <code>{{ sessionResponse.sid }}</code>
            </div>
            <div class="account-multisig__actions">
              <a :href="sessionResponse.wallet_uri" class="account-multisig__wallet-link">
                {{ $t('accounts.multisigWorkspace.openWallet') }}
              </a>
              <BaseButton
                bordered
                data-test="multisig-authenticate"
                :disabled="workspaceState === 'waiting-for-wallet' || workspaceState === 'loading'"
                @click="authenticateAndLoad"
              >
                {{ $t('accounts.multisigWorkspace.authenticate') }}
              </BaseButton>
            </div>
          </div>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('accounts.multisigWorkspace.workspaceTitle')">
      <template #default>
        <div
          v-if="!proposalRouteState.ok"
          class="account-multisig__state"
          role="alert"
          data-test="multisig-invalid-route"
        >
          <span>{{ $t('searchUnsupported') }}</span>
          <BaseButton bordered data-test="multisig-clear-invalid-route" @click="clearInvalidProposalRoute">
            {{ $t('contracts.filters.clearInvalid') }}
          </BaseButton>
        </div>
        <div v-else-if="workspaceState === 'idle'" class="account-multisig__state row-text" role="status">
          {{ $t('accounts.multisigWorkspace.idle') }}
        </div>
        <div
          v-else-if="workspaceState === 'waiting-for-wallet'"
          class="account-multisig__state"
          role="status"
          data-test="multisig-waiting-wallet"
        >
          <BaseLoading />
          <span>{{ $t('accounts.multisigWorkspace.waiting') }}</span>
        </div>
        <div v-else-if="workspaceState === 'loading'" class="account-multisig__state" role="status">
          <BaseLoading />
          <span>{{ $t('accounts.multisigWorkspace.loading') }}</span>
        </div>
        <div
          v-else-if="workspaceState === 'permission-denied'"
          class="account-multisig__state"
          role="alert"
          data-test="multisig-permission-denied"
        >
          <span>{{ $t('accounts.multisigWorkspace.denied') }}</span>
          <BaseButton bordered @click="authenticateAndLoad">
            {{ $t('accounts.multisigWorkspace.retryAuthentication') }}
          </BaseButton>
        </div>
        <div
          v-else-if="workspaceState === 'not-found'"
          class="account-multisig__state row-text"
          role="status"
          data-test="multisig-not-found"
        >
          {{ $t('accounts.multisigWorkspace.notFound') }}
        </div>
        <div
          v-else-if="workspaceState === 'wallet-rejected'"
          class="account-multisig__state row-text"
          role="alert"
          data-test="multisig-wallet-rejected"
        >
          {{ $t('accounts.multisigWorkspace.walletRejected') }}
        </div>
        <div
          v-else-if="workspaceState === 'session-closed'"
          class="account-multisig__state row-text"
          role="alert"
          data-test="multisig-session-closed"
        >
          {{ $t('accounts.multisigWorkspace.sessionClosed') }}
        </div>
        <div
          v-else-if="workspaceState === 'error'"
          class="account-multisig__state"
          role="alert"
          data-test="multisig-workspace-error"
        >
          <span>{{ $t(workspaceErrorKey) }}</span>
          <BaseButton bordered @click="authenticateAndLoad">
            {{ $t('accounts.multisigWorkspace.retryAuthentication') }}
          </BaseButton>
        </div>

        <template v-else-if="workspaceState === 'ready' && spec && proposalsResponse">
          <section class="account-multisig__spec" data-test="multisig-spec">
            <div class="account-multisig__evidence">
              <span>{{ $t('accounts.multisigWorkspace.resolvedAccount') }}</span>
              <BaseLink :to="`/accounts/${encodeURIComponent(spec.resolved_multisig_account_id)}`" monospace>
                {{ spec.resolved_multisig_account_id }}
              </BaseLink>
              <span>{{ $t('accounts.multisigWorkspace.authenticatedReader') }}</span>
              <BaseLink v-if="approvedAccountId" :to="`/accounts/${encodeURIComponent(approvedAccountId)}`" monospace>
                {{ approvedAccountId }}
              </BaseLink>
              <span v-else>{{ $t('accounts.multisigWorkspace.notProvided') }}</span>
              <span>{{ $t('accounts.multisigWorkspace.quorumWeight') }}</span>
              <code>{{ spec.spec.quorum }}</code>
              <span>{{ $t('accounts.multisigWorkspace.transactionTtl') }}</span>
              <code>{{ $t('units.milliseconds', { value: spec.spec.transaction_ttl_ms }) }}</code>
            </div>

            <div class="account-multisig__signatories">
              <h4>{{ $t('accounts.multisigWorkspace.signatories') }}</h4>
              <p class="row-text">
                {{ $t('accounts.multisigWorkspace.signatoriesDescription') }}
              </p>
              <div v-for="[account, weight] in signatories" :key="account" class="account-multisig__signatory">
                <BaseLink :to="`/accounts/${encodeURIComponent(account)}`" monospace>
                  {{ account }}
                </BaseLink>
                <span>{{ $t('accounts.multisigWorkspace.signatoryRole') }}</span>
                <span>{{ $t('accounts.multisigWorkspace.signatoryWeight', { weight }) }}</span>
              </div>
            </div>
          </section>

          <section class="account-multisig__proposals">
            <div class="account-multisig__proposal-toolbar">
              <label>
                <span>{{ $t('accounts.multisigWorkspace.status') }}</span>
                <select v-model="statusFilter" data-test="multisig-status-filter">
                  <option v-for="status in STATUS_FILTERS" :key="status" :value="status">
                    {{ formatProposalStatus(status) }}
                  </option>
                </select>
              </label>
              <div class="account-multisig__actions">
                <BaseButton
                  v-if="cursor"
                  bordered
                  data-test="multisig-first-page"
                  @click="updateRouteQuery({ multisig_cursor: null }, { history: 'push' })"
                >
                  {{ $t('accounts.multisigWorkspace.firstPage') }}
                </BaseButton>
                <BaseButton
                  v-if="proposalsResponse.next_cursor"
                  bordered
                  data-test="multisig-next-page"
                  @click="updateRouteQuery({ multisig_cursor: proposalsResponse.next_cursor }, { history: 'push' })"
                >
                  {{ $t('accounts.multisigWorkspace.nextPage') }}
                </BaseButton>
              </div>
            </div>

            <p v-if="cursor" class="row-text">
              {{ $t('accounts.multisigWorkspace.cursor', { cursor }) }}
            </p>

            <div
              v-if="proposalsResponse.proposals.length === 0"
              class="account-multisig__state row-text"
              role="status"
              data-test="multisig-empty"
            >
              {{ $t('accounts.multisigWorkspace.empty') }}
            </div>

            <article
              v-for="proposal in proposalsResponse.proposals"
              :key="proposal.proposal_id"
              class="account-multisig__proposal"
              data-test="multisig-proposal"
            >
              <header>
                <div>
                  <span class="account-multisig__eyebrow">{{ proposal.operation_type }}</span>
                  <h4>{{ formatProposalStatus(proposal.status) }}</h4>
                </div>
                <code>{{ proposal.proposal_id }}</code>
              </header>

              <dl class="account-multisig__proposal-meta">
                <div>
                  <dt>{{ $t('accounts.multisigWorkspace.instructionsHash') }}</dt>
                  <dd>
                    <code>{{ proposal.instructions_hash }}</code>
                  </dd>
                </div>
                <div>
                  <dt>{{ $t('accounts.multisigWorkspace.proposedAt') }}</dt>
                  <dd>
                    <code>{{ $t('units.milliseconds', { value: proposal.proposal.proposed_at_ms }) }}</code>
                  </dd>
                </div>
                <div>
                  <dt>{{ $t('accounts.multisigWorkspace.expiresAt') }}</dt>
                  <dd>
                    <code>{{ $t('units.milliseconds', { value: proposal.proposal.expires_at_ms }) }}</code>
                  </dd>
                </div>
                <div>
                  <dt>{{ $t('accounts.multisigWorkspace.terminalAt') }}</dt>
                  <dd>
                    <code>
                      {{
                        proposal.terminal_at_ms === null
                          ? $t('accounts.multisigWorkspace.notTerminal')
                          : $t('units.milliseconds', { value: proposal.terminal_at_ms })
                      }}
                    </code>
                  </dd>
                </div>
              </dl>

              <section class="account-multisig__approvals">
                <h5>{{ $t('accounts.multisigWorkspace.approvals') }}</h5>
                <p v-if="proposal.proposal.approvals.length === 0" class="row-text">
                  {{ $t('accounts.multisigWorkspace.noApprovals') }}
                </p>
                <ul v-else>
                  <li v-for="account in proposal.proposal.approvals" :key="account">
                    <BaseLink :to="`/accounts/${encodeURIComponent(account)}`" monospace>
                      {{ account }}
                    </BaseLink>
                  </li>
                </ul>
              </section>

              <section class="account-multisig__instructions">
                <h5>{{ $t('accounts.multisigWorkspace.decodedInstructions') }}</h5>
                <article
                  v-for="(instruction, index) in proposal.proposal.instructions"
                  :key="`${proposal.proposal_id}:${index}`"
                  class="account-multisig__instruction"
                >
                  <InstructionSemanticCard
                    v-if="buildDecodedInstructionPresentation(instruction, networkPrefix)"
                    :presentation="buildDecodedInstructionPresentation(instruction, networkPrefix)!"
                    compact
                  />
                  <div v-else>
                    <strong>{{ $t('accounts.multisigWorkspace.instructionNumber', { index }) }}</strong>
                    <BaseJson :value="instruction" full />
                  </div>
                </article>
              </section>

              <details class="account-multisig__raw">
                <summary>{{ $t('accounts.multisigWorkspace.canonicalJson') }}</summary>
                <BaseJson :value="proposal" full />
              </details>
            </article>
          </section>
        </template>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.account-multisig {
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__connect,
  &__spec,
  &__proposals {
    padding: size(2) size(4) size(4);
  }

  &__connect {
    > p:first-child {
      margin: 0 0 size(2);
      padding: size(2);
      border-inline-start: 3px solid theme-color('primary');
      background: theme-color('background-hover');
    }
  }

  &__state {
    min-height: size(12);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: size(2);
    padding: size(2) size(4);
    text-align: center;
  }

  &__chain-field {
    max-width: size(58);
    display: grid;
    gap: size(1);

    input,
    select {
      min-width: 0;
      padding: size(1.5) size(2);
      border: 1px solid theme-color('border-primary');
      border-radius: size(2);
      color: theme-color('content-primary');
      background: theme-color('background');
    }

    small {
      color: theme-color('content-tertiary');
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: size(1);
    margin-top: size(2);
  }

  &__error {
    color: theme-color('error');
  }

  &__session {
    margin-top: size(2);
    padding: size(2);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    display: grid;
    gap: size(1);

    > div:first-child {
      display: grid;
      gap: size(0.5);
      overflow-wrap: anywhere;
    }
  }

  &__wallet-link {
    display: inline-flex;
    padding: size(1.5) size(2);
    border-radius: size(3);
    color: theme-color('content-secondary-bright');
    text-decoration: none;
    background: theme-color('background');
    @include shadow-elevated;
  }

  &__evidence {
    display: grid;
    grid-template-columns: minmax(10rem, 0.35fr) minmax(14rem, 1fr);
    gap: size(1) size(2);
    align-items: baseline;
    overflow-wrap: anywhere;
  }

  &__signatories {
    margin-top: size(3);

    h4,
    p {
      margin: 0 0 size(1);
    }
  }

  &__signatory {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) auto auto;
    gap: size(2);
    padding: size(1.5) 0;
    border-top: 1px solid theme-color('border-primary');
    align-items: baseline;
  }

  &__proposal-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: size(2);
    margin-bottom: size(2);

    label {
      display: grid;
      gap: size(0.5);
    }

    select {
      padding: size(1) size(2);
      border: 1px solid theme-color('border-primary');
      border-radius: size(2);
      color: theme-color('content-primary');
      background: theme-color('background');
    }
  }

  &__proposal {
    padding: size(3);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
    background: theme-color('background-hover');

    & + & {
      margin-top: size(2);
    }

    > header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: size(2);

      h4 {
        margin: size(0.5) 0 0;
      }

      > code {
        max-width: 100%;
        overflow-wrap: anywhere;
      }
    }
  }

  &__eyebrow {
    color: theme-color('content-tertiary');
    @include tpg-s3;
  }

  &__proposal-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
    gap: size(2);
    margin: size(2) 0 0;

    dt {
      color: theme-color('content-tertiary');
    }

    dd {
      margin: size(0.5) 0 0;
      overflow-wrap: anywhere;
    }
  }

  &__approvals,
  &__instructions,
  &__raw {
    margin-top: size(2.5);

    h5 {
      margin: 0 0 size(1);
    }
  }

  &__approvals ul {
    margin: 0;
    padding-inline-start: size(3);
  }

  &__instruction + &__instruction {
    margin-top: size(1.5);
  }

  &__raw summary {
    cursor: pointer;
  }

  @include xxs {
    &__evidence,
    &__signatory {
      grid-template-columns: 1fr;
    }
  }
}
</style>
