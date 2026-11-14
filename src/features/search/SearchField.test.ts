import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SearchField from './SearchField.vue';
import { i18n } from '@/shared/lib/localization';

const pushSpy = vi.fn();
const errorSpy = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => ({
    list: { value: [] },
    show: vi.fn(),
    close: vi.fn(),
    success: vi.fn(),
    error: errorSpy,
  }),
}));

describe('SearchField', () => {
  const canonicalAccountId =
    'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
  const assetAlias = 'usd#issuer.main';

  beforeEach(() => {
    pushSpy.mockReset();
    errorSpy.mockReset();
  });

  const mountField = () =>
    mount(SearchField, {
      props: {
        placeholder: 'Search',
      },
      global: {
        plugins: [i18n],
      },
    });

  it('navigates to block details when query is numeric', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('123');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({ name: 'blocks-details', params: { heightOrHash: '123' } });
  });

  it('navigates exact hashes to scoped search after normalizing their prefix and case', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue(`0x${'AB'.repeat(32)}`);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'search-results',
      query: { q: 'ab'.repeat(32) },
    });
  });

  it('treats an all-decimal 64-character value as a hash before block height', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('1'.repeat(64));
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'search-results',
      query: { q: '1'.repeat(64) },
    });
  });

  it('does not treat a short hexadecimal prefix as a hash', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('0xabc123');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toContain('supported identifier');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('routes canonical account IDs, asset aliases, RWAs, and NFTs by exact identifier format', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue(canonicalAccountId);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(pushSpy).toHaveBeenNthCalledWith(1, { name: 'account-details', params: { id: canonicalAccountId } });

    await input.setValue(assetAlias);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(pushSpy).toHaveBeenNthCalledWith(2, { name: 'asset-details', params: { id: assetAlias } });

    const rwaId = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF$commodities.main';
    await input.setValue(rwaId);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(pushSpy).toHaveBeenNthCalledWith(3, {
      name: 'rwa-details',
      params: { id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities.main' },
    });

    const nftId = 'collectible$domain.main';
    await input.setValue(nftId);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(pushSpy).toHaveBeenNthCalledWith(4, { name: 'nft-details', params: { id: nftId } });

    const domainId = 'Treasury.Universal';
    await input.setValue(domainId);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(pushSpy).toHaveBeenNthCalledWith(5, {
      name: 'domain-details',
      params: { id: 'treasury.universal' },
    });
  });

  it('does not route account aliases through canonical-ID-only Explorer routes', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue('treasury@banking.retail');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toContain('supported identifier');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects norito account-like literals in account search', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue('norito:4e52543000000001');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toContain('supported identifier');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('shows a persistent inline error when query cannot be resolved', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('??');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(pushSpy).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toContain('supported identifier');
    expect(errorSpy).not.toHaveBeenCalled();
  });
  it('keeps input when navigation rejects and clears its error when edited', async () => {
    pushSpy.mockRejectedValueOnce(new Error('navigation failed'));
    const wrapper = mountField();
    await wrapper.get('input').setValue('123');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('input').element.value).toBe('123');
    expect(wrapper.get('[role=alert]').text()).toContain('could not be opened');
    await wrapper.get('input').setValue('124');
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
  });

  it('retains a cancelled navigation and supports explicit clearing', async () => {
    pushSpy.mockResolvedValueOnce({ type: 4 });
    const wrapper = mountField();
    await wrapper.get('input').setValue('123');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('input').attributes('aria-label')).toBe('Search blockchain');
    expect(wrapper.get('input').element.value).toBe('123');
    await wrapper.get('[aria-label="Clear search"]').trigger('click');
    expect(wrapper.get('input').element.value).toBe('');
    expect(wrapper.find('[role=alert]').exists()).toBe(false);
  });

  it('does not clear a newer query when an older navigation completes', async () => {
    let finish!: () => void;
    pushSpy.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const wrapper = mountField();
    await wrapper.get('input').setValue('123');
    await wrapper.get('form').trigger('submit');
    await wrapper.get('input').setValue('124');
    finish();
    await flushPromises();
    expect(wrapper.get('input').element.value).toBe('124');
  });

});
