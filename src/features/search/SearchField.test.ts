import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
  const accountAlias = 'treasury@banking.retail';
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
    await input.trigger('keyup.enter');

    expect(pushSpy).toHaveBeenCalledWith({ name: 'blocks-details', params: { heightOrHash: '123' } });
  });

  it('navigates to transaction details when query looks like a hash', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('0xabc123');
    await input.trigger('keyup.enter');

    expect(pushSpy).toHaveBeenCalledWith({ name: 'transaction-details', params: { hash: '0xabc123' } });
  });

  it('routes to canonical account ids, account aliases, asset aliases, RWAs, or NFTs based on the identifier format', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue(canonicalAccountId);
    await input.trigger('keyup.enter');
    expect(pushSpy).toHaveBeenNthCalledWith(1, { name: 'account-details', params: { id: canonicalAccountId } });

    await input.setValue(accountAlias);
    await input.trigger('keyup.enter');
    expect(pushSpy).toHaveBeenNthCalledWith(2, { name: 'account-details', params: { id: accountAlias } });

    await input.setValue(assetAlias);
    await input.trigger('keyup.enter');
    expect(pushSpy).toHaveBeenNthCalledWith(3, { name: 'asset-details', params: { id: assetAlias } });

    const rwaId = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF$commodities';
    await input.setValue(rwaId);
    await input.trigger('keyup.enter');
    expect(pushSpy).toHaveBeenNthCalledWith(4, {
      name: 'rwa-details',
      params: { id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef$commodities' },
    });

    const nftId = 'collectible$domain';
    await input.setValue(nftId);
    await input.trigger('keyup.enter');
    expect(pushSpy).toHaveBeenNthCalledWith(5, { name: 'nft-details', params: { id: nftId } });
  });

  it('rejects malformed account aliases', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue('bob@wonder.land.ops');
    await input.trigger('keyup.enter');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects norito account-like literals in account search', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');

    await input.setValue('norito:4e52543000000001');
    await input.trigger('keyup.enter');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('shows an error notification when query cannot be resolved', async () => {
    const wrapper = mountField();
    const input = wrapper.get('input');
    await input.setValue('??');
    await input.trigger('keyup.enter');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
