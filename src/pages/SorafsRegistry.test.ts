import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import QRCode from 'qrcode';
import SorafsRegistry from './SorafsRegistry.vue';
import { ConnectApprovalRejectedError, ConnectSessionClosedError } from '@/shared/lib/connect';
import { ensureLocaleLoaded, i18n } from '@/shared/lib/localization';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';

const toriiBaseUrlState = vi.hoisted(() => ({ value: 'https://taira.sora.org' }));
const runtimeConfigState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const connectApiMocks = vi.hoisted(() => ({
  fetchConnectStatus: vi.fn(),
  createConnectSession: vi.fn(),
  draftMinistryAgendaProposal: vi.fn(),
  getMinistryAgendaProposal: vi.fn(),
  submitSignedTransaction: vi.fn(),
  fetchPipelineTransactionStatus: vi.fn(),
}));
const connectAppSessionMocks = vi.hoisted(() => ({
  waitForApproval: vi.fn(),
  signTransaction: vi.fn(),
  close: vi.fn(),
}));
const connectLibMocks = vi.hoisted(() => ({
  createConnectAppSession: vi.fn(() => ({
    waitForApproval: connectAppSessionMocks.waitForApproval,
    signTransaction: connectAppSessionMocks.signTransaction,
    close: connectAppSessionMocks.close,
  })),
  finalizeSignedTransaction: vi.fn(() => new Uint8Array([0xfa, 0xce])),
}));
const clipboardCopyMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const createObjectUrlMock = vi.hoisted(() => vi.fn().mockReturnValue('blob:agenda-proposal'));
const revokeObjectUrlMock = vi.hoisted(() => vi.fn());
const anchorClickMock = vi.hoisted(() => vi.fn());
const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const scopeExpose = ref<any>({
  isLoading: false,
  data: { status: UNKNOWN_ERROR },
  refetch: vi.fn(),
});
let scopeExposeQueue: any[] = [];
let scopeExposeIndex = 0;

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () => {
    const expose = scopeExposeQueue[scopeExposeIndex++] ?? scopeExpose.value;
    return ref({ expose });
  },
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getToriiBaseUrl: () => toriiBaseUrlState.value,
    fetchConnectStatus: connectApiMocks.fetchConnectStatus,
    createConnectSession: connectApiMocks.createConnectSession,
    draftMinistryAgendaProposal: connectApiMocks.draftMinistryAgendaProposal,
    getMinistryAgendaProposal: connectApiMocks.getMinistryAgendaProposal,
    submitSignedTransaction: connectApiMocks.submitSignedTransaction,
    fetchPipelineTransactionStatus: connectApiMocks.fetchPipelineTransactionStatus,
  };
});

vi.mock('@/shared/lib/connect', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createConnectAppSession: connectLibMocks.createConnectAppSession,
    finalizeSignedTransaction: connectLibMocks.finalizeSignedTransaction,
  };
});

vi.mock('@/shared/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getRuntimeConfig: () => runtimeConfigState.value,
  };
});

vi.mock('@vueuse/core', () => ({
  useClipboard: () => ({
    isSupported: true,
    copy: clipboardCopyMock,
  }),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
  },
}));

const BaseContentBlockStub = defineComponent({
  name: 'BaseContentBlock',
  props: {
    title: { type: String, default: '' },
  },
  template: '<section><h2>{{ title }}</h2><slot /></section>',
});

const BaseTableStub = defineComponent({
  name: 'BaseTable',
  props: {
    items: { type: Array, default: () => [] },
  },
  emits: ['click:row', 'update:page', 'update:page-size'],
  template: `
    <div class="base-table-stub">
      <slot name="header" />
      <div
        v-for="item in items"
        :key="item.digest_hex ?? item.order_id_hex ?? item.alias"
        class="base-table-stub__row"
        @click="$emit('click:row', item)"
      >
        <slot name="row" :item="item" />
      </div>
    </div>
  `,
});

const BaseLinkStub = defineComponent({
  name: 'BaseLink',
  props: {
    to: { type: String, required: true },
  },
  template: '<a :href="to"><slot /></a>',
});

const BaseButtonStub = defineComponent({
  name: 'BaseButton',
  props: {
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
});

const DataFieldStub = defineComponent({
  name: 'DataField',
  props: {
    title: { type: String, default: '' },
    value: { type: [String, Number], default: null },
    link: { type: String, default: '' },
  },
  template: `
    <div
      class="data-field-stub"
      :data-title="title"
      :data-value="value ?? ''"
      :data-link="link"
    />
  `,
});

const BaseJsonStub = defineComponent({
  name: 'BaseJson',
  props: {
    value: { type: null, default: null },
  },
  template: '<pre class="base-json-stub" :data-json="JSON.stringify(value)" />',
});

const qrToDataUrlMock = vi.mocked(QRCode.toDataURL as unknown as (...args: any[]) => Promise<string>);

describe('SorafsRegistry', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en';
    toriiBaseUrlState.value = 'https://taira.sora.org';
    runtimeConfigState.value = {};
    connectApiMocks.fetchConnectStatus.mockReset();
    connectApiMocks.createConnectSession.mockReset();
    connectApiMocks.draftMinistryAgendaProposal.mockReset();
    connectApiMocks.getMinistryAgendaProposal.mockReset();
    connectApiMocks.submitSignedTransaction.mockReset();
    connectApiMocks.fetchPipelineTransactionStatus.mockReset();
    connectApiMocks.fetchConnectStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        enabled: true,
        sessions_total: 4,
        sessions_active: 1,
        per_ip_sessions: [{ ip: '127.0.0.1', sessions: 1 }],
        buffered_sessions: 0,
        total_buffer_bytes: 0,
        dedupe_size: 0,
        policy: {
          ws_max_sessions: 128,
          ws_per_ip_max_sessions: 4,
          ws_rate_per_ip_per_min: 120,
          session_ttl_ms: 300000,
          frame_max_bytes: 64000,
          session_buffer_max_bytes: 262144,
          relay_enabled: true,
          relay_strategy: 'broadcast',
          relay_effective_strategy: 'broadcast',
          relay_p2p_attached: true,
          heartbeat_interval_ms: 30000,
          heartbeat_miss_tolerance: 3,
          heartbeat_min_interval_ms: 5000,
        },
        frames_in_total: 0,
        frames_out_total: 0,
        ciphertext_total: 0,
        dedupe_drops_total: 0,
        buffer_drops_total: 0,
        plaintext_control_drops_total: 0,
        monotonic_drops_total: 0,
        sequence_violation_closes_total: 0,
        role_direction_mismatch_total: 0,
        ping_miss_total: 0,
        p2p_rebroadcasts_total: 0,
        p2p_rebroadcast_skipped_total: 0,
      },
    });
    connectApiMocks.createConnectSession.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        sid: 'session-1',
        wallet_uri: 'iroha://connect?sid=session-1&role=wallet&token=wallet-token',
        app_uri: 'iroha://connect?sid=session-1&role=app&token=app-token',
        token_app: 'app-token',
        token_wallet: 'wallet-token',
        token_relay: 'relay-token',
      },
    });
    connectApiMocks.draftMinistryAgendaProposal.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        ok: true,
        agenda_proposal_id: 'AC-2026-241',
        authority: 'sora-approved-wallet',
        tx_instructions: [{ kind: 'Custom' }],
        signable_transaction_b64: 'AQID',
      },
    });
    connectApiMocks.getMinistryAgendaProposal.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        found: true,
        record: {
          proposal: { proposal_id: 'AC-2026-241' },
          authority: 'sora-approved-wallet',
          submitted_tx_hash_hex: 'ab'.repeat(32),
          submitted_height: 42,
        },
      },
    });
    connectApiMocks.submitSignedTransaction.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        payload: {
          tx_hash: 'ab'.repeat(32),
          submitted_at_ms: 1_770_000_000_000,
          submitted_at_height: 42,
          signer: 'sora-approved-wallet',
        },
        signature: 'ed25519:sig',
      },
    });
    connectApiMocks.fetchPipelineTransactionStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: {
        hash: 'ab'.repeat(32),
        status: {
          kind: 'Committed',
          block_height: 42,
          rejection_reason: null,
        },
        scope: 'auto',
        resolved_from: 'local',
      },
    });
    connectAppSessionMocks.waitForApproval.mockReset();
    connectAppSessionMocks.signTransaction.mockReset();
    connectAppSessionMocks.close.mockReset();
    connectAppSessionMocks.waitForApproval.mockResolvedValue({
      accountId: 'sora-approved-wallet',
    });
    connectAppSessionMocks.signTransaction.mockResolvedValue(new Uint8Array(64).fill(7));
    connectLibMocks.createConnectAppSession.mockClear();
    connectLibMocks.finalizeSignedTransaction.mockReset();
    connectLibMocks.finalizeSignedTransaction.mockImplementation(() => new Uint8Array([0xfa, 0xce]));
    clipboardCopyMock.mockReset();
    clipboardCopyMock.mockResolvedValue(undefined);
    notifications.success.mockReset();
    notifications.error.mockReset();
    qrToDataUrlMock.mockReset();
    qrToDataUrlMock.mockResolvedValue('data:image/png;base64,AAA');
    createObjectUrlMock.mockReset();
    createObjectUrlMock.mockReturnValue('blob:agenda-proposal');
    revokeObjectUrlMock.mockReset();
    anchorClickMock.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlMock,
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: anchorClickMock,
    });
    scopeExposeIndex = 0;
    scopeExposeQueue = [];
    scopeExpose.value = {
      isLoading: false,
      data: { status: UNKNOWN_ERROR },
      refetch: vi.fn(),
    };
  });

  const manifestDigestHex = '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76';
  const manifestPayloadDigestHex = '1265ead5239f75f2b93c05aae1edee8508fa5fc7dc2337c4941218b964659fa1';
  const rootCid = 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi';
  const manifestBlobBase64 =
    'TlJUMAAAt3Qx1Tzz0Na3dDHVPPPQ1gBeAwAAAAAAABD2CBUt0AEZAAEAAAAAAAAAASwAAAAAAAAAJAAAAAAAAAABcR8gE4AM0KMo8nEvyXBLZyOIW8YCWG9USIPhRrOqNBt7nyoQAAAAAAAAAAgAAAAAAAAAcQAAAAAAAADcAAAAAAAAAAwAAAAAAAAABAAAAAAAAAABAAAADgAAAAAAAAAGAAAAAAAAAHNvcmFmcwsAAAAAAAAAAwAAAAAAAABzZjENAAAAAAAAAAUAAAAAAAAAMS4wLjAEAAAAAAAAAAAAAQAEAAAAAAAAAAAABAAEAAAAAAAAAAAACAAEAAAAAAAAAP//AAAIAAAAAAAAAB8AAAAAAAAAQgAAAAAAAAACAAAAAAAAABgAAAAAAAAAEAAAAAAAAABzb3JhZnMuc2YxQDEuMC4wEgAAAAAAAAAKAAAAAAAAAHNvcmFmcy1zZjEIAAAAAAAAAFScAgAAAAAAIAAAAAAAAACjQkcG5gwixl+4di3pXINMkrMDgrTacXoLwANEF1sshwgAAAAAAAAAE6UCAAAAAAAmAAAAAAAAAAIAAAAAAAAAAQAEAAAAAAAAAAEAAAAIAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAH8BAAAAAAAABgAAAAAAAAApAAAAAAAAAAsAAAAAAAAAAwAAAAAAAABhcHAOAAAAAAAAAAYAAAAAAAAAaGF5YWhpKgAAAAAAAAAPAAAAAAAAAAcAAAAAAAAAc3VyZmFjZQsAAAAAAAAAAwAAAAAAAAB3ZWIwAAAAAAAAABMAAAAAAAAACwAAAAAAAABlbnZpcm9ubWVudA0AAAAAAAAABQAAAAAAAAB0YWlyYT8AAAAAAAAAGAAAAAAAAAAQAAAAAAAAAGRlcGxveW1lbnRfbW9kZWwXAAAAAAAAAA8AAAAAAAAAc3RhdGljX2Zyb250ZW5kOAAAAAAAAAAUAAAAAAAAAAwAAAAAAAAAcnVudGltZV9tb2RlFAAAAAAAAAAMAAAAAAAAAGJyb3dzZXJfbGl2ZU0AAAAAAAAAGwAAAAAAAAATAAAAAAAAAGJyb3dzZXJfbGl2ZV9zb3VyY2UiAAAAAAAAABoAAAAAAAAAcWFudGFzX3B1YmxpY19zY2hlZHVsZV9hcGk=';
  const selectedManifestRecord = {
    digest_hex: manifestDigestHex,
    chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
    chunk_digest_sha3_256_hex: '0xchunk',
    pin_policy: {},
    submitted_by: 'alice@test',
    submitted_epoch: 1,
    status: { state: 'approved', epoch: 1 },
    metadata: {},
    alias: { namespace: 'web', name: 'app', fq_name: 'web.app' },
    successor_of_hex: null,
    status_timestamp_unix: 1,
    governance_refs: [],
    council_envelope_digest_hex: null,
    lineage: {
      successor_of_hex: null,
      head_hex: manifestDigestHex,
      depth_to_head: 0,
      is_head: true,
      superseded_by: null,
      immediate_successor: null,
      anomalies: [],
    },
  };

  function buildRegistryScopeQueue(moderation: Record<string, unknown> = { status: 'clear', public_links_enabled: true, matches: [] }) {
    return [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [selectedManifestRecord],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            manifest_id_hex: manifestDigestHex,
            manifest_b64: manifestBlobBase64,
            manifest_digest_hex: manifestDigestHex,
            payload_digest_hex: manifestPayloadDigestHex,
            content_length: 171092,
            chunk_count: 6,
            chunk_profile_handle: 'sorafs.sf1@1.0.0',
            stored_at_unix_secs: 1712227200,
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            content_cid: rootCid,
            manifest_digest_hex: manifestDigestHex,
            manifest_id_hex: manifestDigestHex,
            index_document: 'index.html',
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
            moderation,
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];
  }

  async function fillSubmitterFields(
    wrapper: any,
    {
      proposalId,
      submitterName,
      submitterContact,
      submitterOrganization,
      submitterPgpFingerprint,
      duplicatesRaw,
      note,
      reasonTag,
    }: {
      proposalId: string
      submitterName: string
      submitterContact: string
      submitterOrganization?: string
      submitterPgpFingerprint?: string
      duplicatesRaw?: string
      note: string
      reasonTag?: string
    }
  ) {
    if (reasonTag && wrapper.find('[data-testid="sorafs-blacklist-reason"]').exists()) {
      await wrapper.get('[data-testid="sorafs-blacklist-reason"]').setValue(reasonTag);
    }
    await wrapper.get('[data-testid="sorafs-blacklist-proposal-id"]').setValue(proposalId);
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-name"]').setValue(submitterName);
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-contact"]').setValue(submitterContact);
    if (submitterOrganization !== undefined) {
      await wrapper.get('[data-testid="sorafs-blacklist-submitter-organization"]').setValue(submitterOrganization);
    }
    if (submitterPgpFingerprint !== undefined) {
      await wrapper.get('[data-testid="sorafs-blacklist-submitter-pgp"]').setValue(submitterPgpFingerprint);
    }
    if (duplicatesRaw !== undefined) {
      await wrapper.get('[data-testid="sorafs-blacklist-duplicates"]').setValue(duplicatesRaw);
    }
    await wrapper.get('[data-testid="sorafs-blacklist-note"]').setValue(note);
    await flushPromises();
  }

  const factory = () =>
    mount(SorafsRegistry, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseButton: BaseButtonStub,
          BaseTable: BaseTableStub,
          BaseLink: BaseLinkStub,
          BaseHash: true,
          BaseLoading: true,
          BaseJson: BaseJsonStub,
          DataField: DataFieldStub,
          TimeStamp: true,
        },
      },
    });

  it('renders public links for deployed SoraFS files on the selected manifest', async () => {
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [
              {
                digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
                chunk_digest_sha3_256_hex: '0xchunk',
                pin_policy: {},
                submitted_by: 'alice@test',
                submitted_epoch: 1,
                status: { state: 'approved', epoch: 1 },
                metadata: {},
                alias: null,
                successor_of_hex: null,
                status_timestamp_unix: 1,
                governance_refs: [],
                council_envelope_digest_hex: null,
                lineage: {
                  successor_of_hex: null,
                  head_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                  depth_to_head: 0,
                  is_head: true,
                  superseded_by: null,
                  immediate_successor: null,
                  anomalies: [],
                },
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_b64:
              'TlJUMAAAt3Qx1Tzz0Na3dDHVPPPQ1gBeAwAAAAAAABD2CBUt0AEZAAEAAAAAAAAAASwAAAAAAAAAJAAAAAAAAAABcR8gE4AM0KMo8nEvyXBLZyOIW8YCWG9USIPhRrOqNBt7nyoQAAAAAAAAAAgAAAAAAAAAcQAAAAAAAADcAAAAAAAAAAwAAAAAAAAABAAAAAAAAAABAAAADgAAAAAAAAAGAAAAAAAAAHNvcmFmcwsAAAAAAAAAAwAAAAAAAABzZjENAAAAAAAAAAUAAAAAAAAAMS4wLjAEAAAAAAAAAAAAAQAEAAAAAAAAAAAABAAEAAAAAAAAAAAACAAEAAAAAAAAAP//AAAIAAAAAAAAAB8AAAAAAAAAQgAAAAAAAAACAAAAAAAAABgAAAAAAAAAEAAAAAAAAABzb3JhZnMuc2YxQDEuMC4wEgAAAAAAAAAKAAAAAAAAAHNvcmFmcy1zZjEIAAAAAAAAAFScAgAAAAAAIAAAAAAAAACjQkcG5gwixl+4di3pXINMkrMDgrTacXoLwANEF1sshwgAAAAAAAAAE6UCAAAAAAAmAAAAAAAAAAIAAAAAAAAAAQAEAAAAAAAAAAEAAAAIAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAH8BAAAAAAAABgAAAAAAAAApAAAAAAAAAAsAAAAAAAAAAwAAAAAAAABhcHAOAAAAAAAAAAYAAAAAAAAAaGF5YWhpKgAAAAAAAAAPAAAAAAAAAAcAAAAAAAAAc3VyZmFjZQsAAAAAAAAAAwAAAAAAAAB3ZWIwAAAAAAAAABMAAAAAAAAACwAAAAAAAABlbnZpcm9ubWVudA0AAAAAAAAABQAAAAAAAAB0YWlyYT8AAAAAAAAAGAAAAAAAAAAQAAAAAAAAAGRlcGxveW1lbnRfbW9kZWwXAAAAAAAAAA8AAAAAAAAAc3RhdGljX2Zyb250ZW5kOAAAAAAAAAAUAAAAAAAAAAwAAAAAAAAAcnVudGltZV9tb2RlFAAAAAAAAAAMAAAAAAAAAGJyb3dzZXJfbGl2ZU0AAAAAAAAAGwAAAAAAAAATAAAAAAAAAGJyb3dzZXJfbGl2ZV9zb3VyY2UiAAAAAAAAABoAAAAAAAAAcWFudGFzX3B1YmxpY19zY2hlZHVsZV9hcGk=',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            payload_digest_hex: '1265ead5239f75f2b93c05aae1edee8508fa5fc7dc2337c4941218b964659fa1',
            content_length: 171092,
            chunk_count: 6,
            chunk_profile_handle: 'sorafs.sf1@1.0.0',
            stored_at_unix_secs: 1712227200,
            files: [
              {
                path: ['assets', 'index-SUhJ3r2u.js'],
                offset: 0,
                size: 138106,
                first_chunk: 0,
                chunk_count: 2,
              },
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            content_cid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            index_document: 'index.html',
            files: [
              {
                path: ['assets', 'index-SUhJ3r2u.js'],
                offset: 0,
                size: 138106,
                first_chunk: 0,
                chunk_count: 2,
              },
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
            moderation: {
              status: 'clear',
              public_links_enabled: true,
              matches: [],
            },
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = factory();
    await flushPromises();

    const rootCidField = wrapper.find(`.data-field-stub[data-title="${i18n.global.t('sorafs.detail.rootCid')}"]`);
    expect(rootCidField.attributes('data-value')).toBe('bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi');

    const fileLinks = wrapper.findAll('a').map((node) => ({
      href: node.attributes('href'),
      text: node.text(),
    }));

    expect(fileLinks).toContainEqual({
      href: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/assets/index-SUhJ3r2u.js',
      text: 'assets/index-SUhJ3r2u.js',
    });
    expect(fileLinks).toContainEqual({
      href: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/index.html',
      text: 'index.html',
    });
  });

  it('shows a storage error message when file metadata cannot be loaded', async () => {
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [
              {
                digest_hex: 'manifest-1',
                chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
                chunk_digest_sha3_256_hex: '0xchunk',
                pin_policy: {},
                submitted_by: 'alice@test',
                submitted_epoch: 1,
                status: { state: 'approved', epoch: 1 },
                metadata: {},
                alias: null,
                successor_of_hex: null,
                status_timestamp_unix: 1,
                governance_refs: [],
                council_envelope_digest_hex: null,
                lineage: {
                  successor_of_hex: null,
                  head_hex: 'manifest-1',
                  depth_to_head: 0,
                  is_head: true,
                  superseded_by: null,
                  immediate_successor: null,
                  anomalies: [],
                },
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: { status: UNKNOWN_ERROR },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: { status: UNKNOWN_ERROR },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('sorafs.detail.storageUnavailable'));
  });

  it('creates a wallet connect session and builds a blacklist proposal draft for the selected CID', async () => {
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [
              {
                digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
                chunk_digest_sha3_256_hex: '0xchunk',
                pin_policy: {},
                submitted_by: 'alice@test',
                submitted_epoch: 1,
                status: { state: 'approved', epoch: 1 },
                metadata: {},
                alias: { namespace: 'web', name: 'app', fq_name: 'web.app' },
                successor_of_hex: null,
                status_timestamp_unix: 1,
                governance_refs: [],
                council_envelope_digest_hex: null,
                lineage: {
                  successor_of_hex: null,
                  head_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                  depth_to_head: 0,
                  is_head: true,
                  superseded_by: null,
                  immediate_successor: null,
                  anomalies: [],
                },
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_b64:
              'TlJUMAAAt3Qx1Tzz0Na3dDHVPPPQ1gBeAwAAAAAAABD2CBUt0AEZAAEAAAAAAAAAASwAAAAAAAAAJAAAAAAAAAABcR8gE4AM0KMo8nEvyXBLZyOIW8YCWG9USIPhRrOqNBt7nyoQAAAAAAAAAAgAAAAAAAAAcQAAAAAAAADcAAAAAAAAAAwAAAAAAAAABAAAAAAAAAABAAAADgAAAAAAAAAGAAAAAAAAAHNvcmFmcwsAAAAAAAAAAwAAAAAAAABzZjENAAAAAAAAAAUAAAAAAAAAMS4wLjAEAAAAAAAAAAAAAQAEAAAAAAAAAAAABAAEAAAAAAAAAAAACAAEAAAAAAAAAP//AAAIAAAAAAAAAB8AAAAAAAAAQgAAAAAAAAACAAAAAAAAABgAAAAAAAAAEAAAAAAAAABzb3JhZnMuc2YxQDEuMC4wEgAAAAAAAAAKAAAAAAAAAHNvcmFmcy1zZjEIAAAAAAAAAFScAgAAAAAAIAAAAAAAAACjQkcG5gwixl+4di3pXINMkrMDgrTacXoLwANEF1sshwgAAAAAAAAAE6UCAAAAAAAmAAAAAAAAAAIAAAAAAAAAAQAEAAAAAAAAAAEAAAAIAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAH8BAAAAAAAABgAAAAAAAAApAAAAAAAAAAsAAAAAAAAAAwAAAAAAAABhcHAOAAAAAAAAAAYAAAAAAAAAaGF5YWhpKgAAAAAAAAAPAAAAAAAAAAcAAAAAAAAAc3VyZmFjZQsAAAAAAAAAAwAAAAAAAAB3ZWIwAAAAAAAAABMAAAAAAAAACwAAAAAAAABlbnZpcm9ubWVudA0AAAAAAAAABQAAAAAAAAB0YWlyYT8AAAAAAAAAGAAAAAAAAAAQAAAAAAAAAGRlcGxveW1lbnRfbW9kZWwXAAAAAAAAAA8AAAAAAAAAc3RhdGljX2Zyb250ZW5kOAAAAAAAAAAUAAAAAAAAAAwAAAAAAAAAcnVudGltZV9tb2RlFAAAAAAAAAAMAAAAAAAAAGJyb3dzZXJfbGl2ZU0AAAAAAAAAGwAAAAAAAAATAAAAAAAAAGJyb3dzZXJfbGl2ZV9zb3VyY2UiAAAAAAAAABoAAAAAAAAAcWFudGFzX3B1YmxpY19zY2hlZHVsZV9hcGk=',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            payload_digest_hex: '1265ead5239f75f2b93c05aae1edee8508fa5fc7dc2337c4941218b964659fa1',
            content_length: 171092,
            chunk_count: 6,
            chunk_profile_handle: 'sorafs.sf1@1.0.0',
            stored_at_unix_secs: 1712227200,
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            content_cid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            index_document: 'index.html',
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
            moderation: {
              status: 'clear',
              public_links_enabled: true,
              matches: [],
            },
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = factory();
    await flushPromises();

    await wrapper.get('[data-testid="sorafs-blacklist-reason"]').setValue('fraud');
    await wrapper.get('[data-testid="sorafs-blacklist-proposal-id"]').setValue('AC-2026-241');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-name"]').setValue('Alice Moderator');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-contact"]').setValue('alice@example.com');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-organization"]').setValue('Sora Ops');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-pgp"]').setValue(
      'a2b3c4d5e6f70123456789abcdef0123456789ab'
    );
    await wrapper.get('[data-testid="sorafs-blacklist-duplicates"]').setValue('AC-2025-014, AC-2025-015');
    await wrapper.get('[data-testid="sorafs-blacklist-note"]').setValue('Customer report with reproduced payload.');
    await wrapper.get('[data-testid="sorafs-connect-create"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.createConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        node: 'taira.sora.org',
      })
    );
    expect(qrToDataUrlMock).toHaveBeenCalledWith(
      'irohaconnect://connect?sid=session-1&role=wallet&token=wallet-token',
      expect.any(Object)
    );
    expect(wrapper.get('[data-testid="sorafs-connect-wallet-link"]').attributes('href')).toBe(
      'irohaconnect://connect?sid=session-1&role=wallet&token=wallet-token'
    );

    const draft = JSON.parse(wrapper.get('[data-testid="sorafs-blacklist-draft"]').attributes('data-json') ?? '{}');
    expect(draft.proposal_id).toBe('AC-2026-241');
    expect(draft.tags).toEqual(['fraud']);
    expect(draft.summary.motivation).toBe(
      'Fraud review requested for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 and its public SoraFS root CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi.'
    );
    expect(draft.targets[0]).toMatchObject({
      hash_family: 'sorafs-root-cid',
      hash_hex: '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a',
      reason:
        'Fraud moderation report for SoraFS CID bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi · Customer report with reproduced payload.',
    });
    expect(draft.submitter).toMatchObject({
      name: 'Alice Moderator',
      contact: 'alice@example.com',
      organization: 'Sora Ops',
      pgp_fingerprint: 'A2B3C4D5E6F70123456789ABCDEF0123456789AB',
    });
    expect(draft.duplicates).toEqual(['AC-2025-014', 'AC-2025-015']);
    expect(draft.evidence).toEqual([
      {
        kind: 'sorafs-cid',
        uri: 'sorafs://bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/manifest.car',
        digest_blake3_hex: '1265ead5239f75f2b93c05aae1edee8508fa5fc7dc2337c4941218b964659fa1',
        description: 'Manifest CAR evidence for 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76.',
      },
      {
        kind: 'url',
        uri: 'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/',
        description:
          'Explorer evidence for manifest 190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76 · Customer report with reproduced payload.',
      },
    ]);

    const expectedFilename =
      'agenda-proposal-AC-2026-241-bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi.json';
    const expectedValidateCommand = `cargo xtask ministry-agenda validate --proposal ./${expectedFilename}`;
    const expectedImpactCommand =
      `cargo xtask ministry-agenda impact --proposal ./${expectedFilename} --out ./impact-AC-2026-241.json`;
    expect(wrapper.get('[data-testid="sorafs-blacklist-filename"]').text()).toContain(expectedFilename);
    expect(wrapper.get('[data-testid="sorafs-blacklist-validate-command"]').text()).toContain(expectedValidateCommand);
    expect(wrapper.get('[data-testid="sorafs-blacklist-impact-command"]').text()).toContain(expectedImpactCommand);

    await wrapper.get('[data-testid="sorafs-blacklist-copy"]').trigger('click');
    await flushPromises();

    expect(clipboardCopyMock).toHaveBeenCalledWith(expect.stringContaining('"proposal_id": "AC-2026-241"'));

    await wrapper.get('[data-testid="sorafs-blacklist-copy-validate"]').trigger('click');
    await flushPromises();
    expect(clipboardCopyMock).toHaveBeenCalledWith(expectedValidateCommand);

    await wrapper.get('[data-testid="sorafs-blacklist-copy-impact"]').trigger('click');
    await flushPromises();
    expect(clipboardCopyMock).toHaveBeenCalledWith(expectedImpactCommand);

    await wrapper.get('[data-testid="sorafs-blacklist-download"]').trigger('click');
    await flushPromises();
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:agenda-proposal');
  });

  it('submits an add-to-denylist proposal through IrohaConnect and loads the Ministry record', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      submitterOrganization: 'Sora Ops',
      submitterPgpFingerprint: 'a2b3c4d5e6f70123456789abcdef0123456789ab',
      duplicatesRaw: 'AC-2025-014, AC-2025-015',
      note: 'Customer report with reproduced payload.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.createConnectSession).toHaveBeenCalledTimes(1);
    expect(connectLibMocks.createConnectAppSession).toHaveBeenCalledTimes(1);
    expect(connectApiMocks.draftMinistryAgendaProposal).toHaveBeenCalledWith({
      proposal: expect.objectContaining({
        proposal_id: 'AC-2026-241',
        action: 'add-to-denylist',
        language: 'en',
      }),
      authority: 'sora-approved-wallet',
    });
    expect(connectAppSessionMocks.signTransaction).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(connectLibMocks.finalizeSignedTransaction).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      new Uint8Array(64).fill(7)
    );
    expect(connectApiMocks.submitSignedTransaction).toHaveBeenCalledWith(new Uint8Array([0xfa, 0xce]));
    expect(connectApiMocks.getMinistryAgendaProposal).toHaveBeenCalledWith('AC-2026-241');
    expect(connectAppSessionMocks.close).toHaveBeenCalledTimes(1);
    expect(notifications.success).toHaveBeenCalledWith(i18n.global.t('sorafs.proposal.notifications.walletSubmitted'));
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.submitted')
    );
    expect(wrapper.find('[data-testid="sorafs-connect-submission-error"]').exists()).toBe(false);
    expect(wrapper.find('.data-field-stub').attributes('data-title')).toBeTruthy();
    expect(wrapper.html()).toContain('sora-approved-wallet');
    expect(wrapper.get('[data-testid="sorafs-blacklist-submission-record"]').attributes('data-json')).toContain(
      '"submitted_height":42'
    );
  });

  it('submits a remove-from-denylist proposal through IrohaConnect using existing moderation references', async () => {
    scopeExposeQueue = buildRegistryScopeQueue({
      status: 'mixed_blocked',
      public_links_enabled: false,
      matches: [
        {
          scope: 'local',
          match_kind: 'cid',
          pack_id: null,
          policy_tier: 'emergency',
          reason: 'local operator quarantine',
          jurisdiction: 'US',
          issued_at: '2026-04-06T00:00:00Z',
          expires_at: '2026-04-07T00:00:00Z',
          review_due_at: '2026-04-06T12:00:00Z',
          issued_by_proposal_id: null,
          review_reference: null,
          governance_reference: null,
          pack_manifest_cid: null,
          merkle_root: null,
        },
        {
          scope: 'global',
          match_kind: 'manifest_digest',
          pack_id: 'global-core',
          policy_tier: 'permanent',
          reason: 'governance-backed removal review',
          jurisdiction: 'US',
          issued_at: '2026-04-05T00:00:00Z',
          expires_at: null,
          review_due_at: null,
          issued_by_proposal_id: 'AC-2026-111',
          review_reference: 'AC-2026-112',
          governance_reference: 'council-resolution-2026-014',
          pack_manifest_cid: 'bafy-pack',
          merkle_root: 'merkle-root',
        },
      ],
    });
    connectApiMocks.draftMinistryAgendaProposal.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        ok: true,
        agenda_proposal_id: 'AC-2026-242',
        authority: 'sora-approved-wallet',
        tx_instructions: [{ kind: 'Custom' }],
        signable_transaction_b64: 'AQID',
      },
    });
    connectApiMocks.getMinistryAgendaProposal.mockResolvedValueOnce({
      status: SUCCESSFUL_FETCHING,
      data: {
        found: true,
        record: {
          proposal: { proposal_id: 'AC-2026-242' },
          authority: 'sora-approved-wallet',
          submitted_tx_hash_hex: 'cd'.repeat(32),
          submitted_height: 43,
        },
      },
    });

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      proposalId: 'AC-2026-242',
      submitterName: 'Review Council',
      submitterContact: 'review@example.com',
      duplicatesRaw: 'AC-2026-111, AC-2026-112',
      note: 'Appeal accepted after the duplicate false-positive review completed.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.draftMinistryAgendaProposal).toHaveBeenCalledWith({
      proposal: expect.objectContaining({
        proposal_id: 'AC-2026-242',
        action: 'remove-from-denylist',
        duplicates: ['AC-2026-111', 'AC-2026-112'],
        language: 'en',
      }),
      authority: 'sora-approved-wallet',
    });
    expect(connectApiMocks.getMinistryAgendaProposal).toHaveBeenCalledWith('AC-2026-242');
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.submitted')
    );
    expect(wrapper.get('[data-testid="sorafs-blacklist-submission-record"]').attributes('data-json')).toContain(
      '"proposal_id":"AC-2026-242"'
    );
  });

  it('surfaces an already-submitted record when the Ministry draft endpoint returns conflict', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();
    connectApiMocks.draftMinistryAgendaProposal.mockResolvedValueOnce({
      status: 'conflict',
      data: {
        found: true,
        record: {
          proposal: { proposal_id: 'AC-2026-241' },
          authority: 'sora-approved-wallet',
          submitted_tx_hash_hex: 'ef'.repeat(32),
          submitted_height: 99,
        },
      },
    });

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      note: 'Customer report with reproduced payload.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectAppSessionMocks.signTransaction).not.toHaveBeenCalled();
    expect(connectApiMocks.submitSignedTransaction).not.toHaveBeenCalled();
    expect(notifications.success).toHaveBeenCalledWith(i18n.global.t('sorafs.proposal.notifications.alreadySubmitted'));
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.submitted')
    );
    expect(wrapper.get('[data-testid="sorafs-blacklist-submission-record"]').attributes('data-json')).toContain(
      '"submitted_height":99'
    );
  });

  it('reports wallet rejection without attempting a draft or transaction submit', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();
    const walletRejectedError = new ConnectApprovalRejectedError('Wallet rejected for review.');
    (walletRejectedError as any).reason = 'Wallet rejected for review.';
    connectAppSessionMocks.waitForApproval.mockRejectedValueOnce(walletRejectedError);

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      note: 'Customer report with reproduced payload.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.draftMinistryAgendaProposal).not.toHaveBeenCalled();
    expect(connectApiMocks.submitSignedTransaction).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Wallet rejected for review.');
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.wallet_rejected')
    );
    expect(wrapper.get('[data-testid="sorafs-connect-submission-error"]').text()).toContain(
      'Wallet rejected for review.'
    );
  });

  it('reports a closed Connect session before submission completes', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();
    connectAppSessionMocks.waitForApproval.mockRejectedValueOnce(
      new ConnectSessionClosedError('Socket closed by wallet.')
    );

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      note: 'Customer report with reproduced payload.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.draftMinistryAgendaProposal).not.toHaveBeenCalled();
    expect(connectApiMocks.submitSignedTransaction).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Socket closed by wallet.');
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.session_closed')
    );
    expect(wrapper.get('[data-testid="sorafs-connect-submission-error"]').text()).toContain(
      'Socket closed by wallet.'
    );
  });

  it('reports Ministry draft-endpoint failures as submission_failed without attempting signing', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();
    connectApiMocks.draftMinistryAgendaProposal.mockResolvedValueOnce({
      status: UNKNOWN_ERROR,
      error: new Error('Ministry draft endpoint unavailable.'),
    });

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      note: 'Customer report with reproduced payload.',
    });

    await wrapper.get('[data-testid="sorafs-blacklist-submit"]').trigger('click');
    await flushPromises();

    expect(connectApiMocks.draftMinistryAgendaProposal).toHaveBeenCalledTimes(1);
    expect(connectAppSessionMocks.signTransaction).not.toHaveBeenCalled();
    expect(connectApiMocks.submitSignedTransaction).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Ministry draft endpoint unavailable.');
    expect(wrapper.get('[data-testid="sorafs-connect-submission-state"]').text()).toContain(
      i18n.global.t('sorafs.connect.sessionStates.submission_failed')
    );
    expect(wrapper.get('[data-testid="sorafs-connect-submission-error"]').text()).toContain(
      'Ministry draft endpoint unavailable.'
    );
  });

  it('localizes the generated proposal payload text from the active UI locale', async () => {
    scopeExposeQueue = buildRegistryScopeQueue();
    await ensureLocaleLoaded('fr');
    i18n.global.locale.value = 'fr';

    const wrapper = factory();
    await flushPromises();

    await fillSubmitterFields(wrapper, {
      reasonTag: 'fraud',
      proposalId: 'AC-2026-241',
      submitterName: 'Alice Moderator',
      submitterContact: 'alice@example.com',
      note: '',
    });

    const draft = JSON.parse(wrapper.get('[data-testid="sorafs-blacklist-draft"]').attributes('data-json') ?? '{}');
    const englishMessages = i18n.global.getLocaleMessage('en') as any;
    expect(draft.language).toBe('fr');
    expect(draft.summary.title).toBe(i18n.global.t('sorafs.proposal.payload.titleAdd', { rootCid }));
    expect(draft.summary.title).not.toBe(englishMessages.sorafs.proposal.payload.titleAdd);
    expect(draft.summary.expected_impact).toBe(i18n.global.t('sorafs.proposal.payload.expectedImpactAdd'));
    expect(draft.evidence[0]?.description).toBe(
      i18n.global.t('sorafs.proposal.payload.cidEvidenceDescriptionAdd', { manifestDigest: manifestDigestHex })
    );
    expect(draft.evidence[0]?.description).not.toContain('Manifest CAR evidence for');
  });

  it('keeps blocked manifests visible while switching the draft flow to denylist removal', async () => {
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [
              {
                digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
                chunk_digest_sha3_256_hex: '0xchunk',
                pin_policy: {},
                submitted_by: 'alice@test',
                submitted_epoch: 1,
                status: { state: 'approved', epoch: 1 },
                metadata: {},
                alias: { namespace: 'web', name: 'app', fq_name: 'web.app' },
                successor_of_hex: null,
                status_timestamp_unix: 1,
                governance_refs: [],
                council_envelope_digest_hex: null,
                lineage: {
                  successor_of_hex: null,
                  head_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
                  depth_to_head: 0,
                  is_head: true,
                  superseded_by: null,
                  immediate_successor: null,
                  anomalies: [],
                },
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_b64:
              'TlJUMAAAt3Qx1Tzz0Na3dDHVPPPQ1gBeAwAAAAAAABD2CBUt0AEZAAEAAAAAAAAAASwAAAAAAAAAJAAAAAAAAAABcR8gE4AM0KMo8nEvyXBLZyOIW8YCWG9USIPhRrOqNBt7nyoQAAAAAAAAAAgAAAAAAAAAcQAAAAAAAADcAAAAAAAAAAwAAAAAAAAABAAAAAAAAAABAAAADgAAAAAAAAAGAAAAAAAAAHNvcmFmcwsAAAAAAAAAAwAAAAAAAABzZjENAAAAAAAAAAUAAAAAAAAAMS4wLjAEAAAAAAAAAAAAAQAEAAAAAAAAAAAABAAEAAAAAAAAAAAACAAEAAAAAAAAAP//AAAIAAAAAAAAAB8AAAAAAAAAQgAAAAAAAAACAAAAAAAAABgAAAAAAAAAEAAAAAAAAABzb3JhZnMuc2YxQDEuMC4wEgAAAAAAAAAKAAAAAAAAAHNvcmFmcy1zZjEIAAAAAAAAAFScAgAAAAAAIAAAAAAAAACjQkcG5gwixl+4di3pXINMkrMDgrTacXoLwANEF1sshwgAAAAAAAAAE6UCAAAAAAAmAAAAAAAAAAIAAAAAAAAAAQAEAAAAAAAAAAEAAAAIAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAH8BAAAAAAAABgAAAAAAAAApAAAAAAAAAAsAAAAAAAAAAwAAAAAAAABhcHAOAAAAAAAAAAYAAAAAAAAAaGF5YWhpKgAAAAAAAAAPAAAAAAAAAAcAAAAAAAAAc3VyZmFjZQsAAAAAAAAAAwAAAAAAAAB3ZWIwAAAAAAAAABMAAAAAAAAACwAAAAAAAABlbnZpcm9ubWVudA0AAAAAAAAABQAAAAAAAAB0YWlyYT8AAAAAAAAAGAAAAAAAAAAQAAAAAAAAAGRlcGxveW1lbnRfbW9kZWwXAAAAAAAAAA8AAAAAAAAAc3RhdGljX2Zyb250ZW5kOAAAAAAAAAAUAAAAAAAAAAwAAAAAAAAAcnVudGltZV9tb2RlFAAAAAAAAAAMAAAAAAAAAGJyb3dzZXJfbGl2ZU0AAAAAAAAAGwAAAAAAAAATAAAAAAAAAGJyb3dzZXJfbGl2ZV9zb3VyY2UiAAAAAAAAABoAAAAAAAAAcWFudGFzX3B1YmxpY19zY2hlZHVsZV9hcGk=',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            payload_digest_hex: '1265ead5239f75f2b93c05aae1edee8508fa5fc7dc2337c4941218b964659fa1',
            content_length: 171092,
            chunk_count: 6,
            chunk_profile_handle: 'sorafs.sf1@1.0.0',
            stored_at_unix_secs: 1712227200,
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            content_cid: 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi',
            manifest_digest_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            manifest_id_hex: '190268b6eb4d76a57832b0fc4ae97cd425ad9415d6f557653fdb9eae28f04d76',
            index_document: 'index.html',
            files: [
              {
                path: ['index.html'],
                offset: 170637,
                size: 455,
                first_chunk: 5,
                chunk_count: 1,
              },
            ],
            moderation: {
              status: 'mixed_blocked',
              public_links_enabled: false,
              matches: [
                {
                  scope: 'local',
                  match_kind: 'cid',
                  pack_id: null,
                  policy_tier: 'emergency',
                  reason: 'local operator quarantine',
                  jurisdiction: 'US',
                  issued_at: '2026-04-06T00:00:00Z',
                  expires_at: '2026-04-07T00:00:00Z',
                  review_due_at: '2026-04-06T12:00:00Z',
                  issued_by_proposal_id: null,
                  review_reference: null,
                  governance_reference: null,
                  pack_manifest_cid: null,
                  merkle_root: null,
                },
                {
                  scope: 'global',
                  match_kind: 'manifest_digest',
                  pack_id: 'global-core',
                  policy_tier: 'permanent',
                  reason: 'governance-backed removal review',
                  jurisdiction: 'US',
                  issued_at: '2026-04-05T00:00:00Z',
                  expires_at: null,
                  review_due_at: null,
                  issued_by_proposal_id: 'AC-2026-111',
                  review_reference: 'AC-2026-112',
                  governance_reference: 'council-resolution-2026-014',
                  pack_manifest_cid: 'bafy-pack',
                  merkle_root: 'merkle-root',
                },
              ],
            },
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.get('[data-testid="sorafs-moderation-status"]').text()).toContain(
      'Local and global denylist matches are active'
    );
    expect(wrapper.get('[data-testid="sorafs-public-links-blocked"]').text()).toContain(
      'Public file links are blocked on this gateway'
    );
    expect(wrapper.find('[data-testid="sorafs-blacklist-reason"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="sorafs-blacklist-action"]').text()).toContain('remove-from-denylist');
    expect((wrapper.get('[data-testid="sorafs-blacklist-duplicates"]').element as HTMLInputElement).value).toBe(
      'AC-2026-111, AC-2026-112'
    );

    const rootCidField = wrapper.find(`.data-field-stub[data-title="${i18n.global.t('sorafs.detail.rootCid')}"]`);
    expect(rootCidField.attributes('data-link')).toBe('');

    const publicFileAnchors = wrapper
      .findAll('a')
      .filter((node) => (node.attributes('href') ?? '').startsWith('https://taira.sora.org/sorafs/cid/'));
    expect(publicFileAnchors).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="sorafs-file-path-blocked"]')).toHaveLength(1);

    await wrapper.get('[data-testid="sorafs-blacklist-proposal-id"]').setValue('AC-2026-242');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-name"]').setValue('Review Council');
    await wrapper.get('[data-testid="sorafs-blacklist-submitter-contact"]').setValue('review@example.com');
    await wrapper
      .get('[data-testid="sorafs-blacklist-note"]')
      .setValue('Appeal accepted after the duplicate false-positive review completed.');
    await flushPromises();

    const draft = JSON.parse(wrapper.get('[data-testid="sorafs-blacklist-draft"]').attributes('data-json') ?? '{}');
    expect(draft.action).toBe('remove-from-denylist');
    expect(draft.tags).toEqual([]);
    expect(draft.duplicates).toEqual(['AC-2026-111', 'AC-2026-112']);
    expect(draft.summary.expected_impact).toContain('remove the selected root CID from the denylist');
  });

  it('shows the connect-disabled state when the Torii endpoint does not expose Connect', async () => {
    connectApiMocks.fetchConnectStatus.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: null,
    });
    scopeExposeQueue = [
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 1,
            returned_count: 1,
            offset: 0,
            limit: 10,
            manifests: [
              {
                digest_hex: 'manifest-1',
                chunker: { profile_id: 1, namespace: 'sorafs', name: 'sf1', semver: '1.0.0', multihash_code: 31 },
                chunk_digest_sha3_256_hex: '0xchunk',
                pin_policy: {},
                submitted_by: 'alice@test',
                submitted_epoch: 1,
                status: { state: 'approved', epoch: 1 },
                metadata: {},
                alias: null,
                successor_of_hex: null,
                status_timestamp_unix: 1,
                governance_refs: [],
                council_envelope_digest_hex: null,
                lineage: {
                  successor_of_hex: null,
                  head_hex: 'manifest-1',
                  depth_to_head: 0,
                  is_head: true,
                  superseded_by: null,
                  immediate_successor: null,
                  anomalies: [],
                },
              },
            ],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: { status: UNKNOWN_ERROR },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: { status: UNKNOWN_ERROR },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            aliases: [],
          },
        },
        refetch: vi.fn(),
      },
      {
        isLoading: false,
        data: {
          status: SUCCESSFUL_FETCHING,
          data: {
            attestation: { block_height: 1, block_hash_hex: '0x1', chain_id: 'taira' },
            total_count: 0,
            returned_count: 0,
            offset: 0,
            limit: 10,
            replication_orders: [],
          },
        },
        refetch: vi.fn(),
      },
    ];

    const wrapper = factory();
    await flushPromises();

    expect(wrapper.text()).toContain('Connect is not enabled on this Torii endpoint.');
    expect(wrapper.get('[data-testid="sorafs-connect-create"]').attributes('disabled')).toBeDefined();
  });
});
