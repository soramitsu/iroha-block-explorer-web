import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { SUCCESSFUL_FETCHING, UNKNOWN_ERROR } from '@/shared/api/consts';
import { i18n } from '@/shared/lib/localization';
import SoraclesPage from './SoraclesPage.vue';

const api = vi.hoisted(() => ({
  fetchSoracleFeeds: vi.fn(),
  fetchSoracleFeedHistory: vi.fn(),
  fetchLatestDefiOracleAttestation: vi.fn(),
}));
vi.mock('@/shared/api', () => api);

const feeds = [
  { feed_id: ['price_xor_usd'], feed_config_version: [1], connector_id: 'prices' },
  { feed_id: ['social_follow'], feed_config_version: [2], connector_id: 'social' },
];
const histories = {
  price_xor_usd: [
    {
      event: { feed_id: ['price_xor_usd'], slot: '10', outcome: { result: 'Missing', detail: null } },
      recorded_at_ms: '11',
      evidence_hashes: [],
    },
  ],
  social_follow: [
    {
      event: { feed_id: ['social_follow'], slot: '20', outcome: { result: 'Missing', detail: null } },
      recorded_at_ms: '21',
      evidence_hashes: [],
    },
  ],
};
const attestation = {
  key: { domain: 4, subject_id: '42' },
  status_flags: 7,
  attestation_hash: '9',
};

const BaseContentBlockStub = {
  name: 'BaseContentBlock',
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};
const BaseJsonStub = {
  name: 'BaseJson',
  props: ['value'],
  template: '<pre>{{ JSON.stringify(value) }}</pre>',
};
const BaseButtonStub = {
  name: 'BaseButton',
  props: ['nativeType', 'disabled'],
  template: '<button :type="nativeType || \'button\'" :disabled="disabled"><slot /></button>',
};

function mountPage() {
  return mount(SoraclesPage, {
    global: {
      plugins: [i18n],
      stubs: {
        BaseButton: BaseButtonStub,
        BaseContentBlock: BaseContentBlockStub,
        BaseJson: BaseJsonStub,
        BaseLoading: { name: 'BaseLoading', template: '<span>loading</span>' },
      },
    },
  });
}

describe('SoraclesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchSoracleFeeds.mockResolvedValue({ status: SUCCESSFUL_FETCHING, data: feeds });
    api.fetchSoracleFeedHistory.mockImplementation(async (feedId: keyof typeof histories) => ({
      status: SUCCESSFUL_FETCHING,
      data: histories[feedId],
    }));
    api.fetchLatestDefiOracleAttestation.mockResolvedValue({
      status: SUCCESSFUL_FETCHING,
      data: attestation,
    });
  });

  it('loads the feed registry, selects the first exact tuple id, and loads its retained history', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(api.fetchSoracleFeeds).toHaveBeenCalledOnce();
    expect(api.fetchSoracleFeedHistory).toHaveBeenCalledWith('price_xor_usd');
    expect(wrapper.get('[data-test="soracle-feed-select"]').element).toHaveProperty('value', 'price_xor_usd');
    expect(wrapper.get('[data-test="soracles-feeds"]').text()).toContain('prices');
    expect(wrapper.get('[data-test="soracle-history"]').text()).toContain('price_xor_usd');
  });

  it('rekeys history requests when the selected feed changes without retaining the previous payload', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="soracle-feed-select"]').setValue('social_follow');
    await flushPromises();

    expect(api.fetchSoracleFeedHistory).toHaveBeenLastCalledWith('social_follow');
    expect(wrapper.get('[data-test="soracle-history"]').text()).toContain('social_follow');
    expect(wrapper.get('[data-test="soracle-history"]').text()).not.toContain('price_xor_usd');
  });

  it('submits canonical DeFi query scalars and refreshes an identical applied query', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="soracle-domain"]').setValue('4');
    await wrapper.get('[data-test="soracle-subject-id"]').setValue('42');
    await wrapper.get('[data-test="soracle-status"]').setValue('7');
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();

    expect(api.fetchLatestDefiOracleAttestation).toHaveBeenCalledWith({ domain: 4, subject_id: '42', status: 7 });
    expect(wrapper.get('[data-test="soracle-attestation"]').text()).toContain('attestation_hash');

    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();
    expect(api.fetchLatestDefiOracleAttestation).toHaveBeenCalledTimes(2);
  });

  it('submits the maximum u64 subject without precision loss', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="soracle-subject-id"]').setValue('18446744073709551615');
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();

    expect(api.fetchLatestDefiOracleAttestation).toHaveBeenCalledWith({
      domain: 1,
      subject_id: '18446744073709551615',
      status: undefined,
    });
  });

  it.each(['01', '-1', '18446744073709551616'])('fails closed for a noncanonical subject id %s', async (subjectId) => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="soracle-subject-id"]').setValue(subjectId);
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();

    expect(api.fetchLatestDefiOracleAttestation).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('Unsupported search query');
  });

  it('clears a stale attestation on invalid submission and recovers with a valid query', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-test="soracle-subject-id"]').setValue('42');
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-test="soracle-attestation"]').exists()).toBe(true);

    await wrapper.get('[data-test="soracle-subject-id"]').setValue('01');
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();
    expect(api.fetchLatestDefiOracleAttestation).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[role="alert"]').text()).toContain('Unsupported search query');
    expect(wrapper.find('[data-test="soracle-attestation"]').exists()).toBe(false);

    await wrapper.get('[data-test="soracle-subject-id"]').setValue('42');
    await wrapper.get('[data-test="soracle-attestation-form"]').trigger('submit');
    await flushPromises();
    expect(api.fetchLatestDefiOracleAttestation).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-test="soracle-attestation"]').exists()).toBe(true);
  });

  it('keeps feed loading failures explicit and retryable', async () => {
    api.fetchSoracleFeeds.mockResolvedValue({ status: UNKNOWN_ERROR, error: new Error('offline') });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded');
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(api.fetchSoracleFeeds).toHaveBeenCalledTimes(2);
  });
});
