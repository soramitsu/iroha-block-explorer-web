import { describe, expect, it } from 'vitest';
import { getAccountRoutePath, getDisplayedAccountId, normalizeAccountRoutePath } from './account-id';

describe('account id display helpers', () => {
  const modernCanonicalId = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
  const modernTestnetId = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';

  it('does not reinterpret account aliases as canonical Explorer account IDs', () => {
    expect(getDisplayedAccountId('Treasury@Banking.Retail')).toBe('Treasury@Banking.Retail');
  });

  it('preserves account ids exactly as provided for display', () => {
    expect(getDisplayedAccountId(modernCanonicalId)).toBe(modernCanonicalId);
    expect(getDisplayedAccountId(modernTestnetId)).toBe(modernTestnetId);
  });

  it('preserves account detail routes without rewriting their network literal', () => {
    expect(getAccountRoutePath(modernCanonicalId)).toBe(`/accounts/${encodeURIComponent(modernCanonicalId)}`);
    expect(normalizeAccountRoutePath(`/accounts/${encodeURIComponent(modernCanonicalId)}?foo=bar`)).toBe(
      `/accounts/${encodeURIComponent(modernCanonicalId)}?foo=bar`
    );
    expect(normalizeAccountRoutePath(`/accounts/${encodeURIComponent(modernTestnetId)}?foo=bar`)).toBe(
      `/accounts/${encodeURIComponent(modernTestnetId)}?foo=bar`
    );
  });
});
