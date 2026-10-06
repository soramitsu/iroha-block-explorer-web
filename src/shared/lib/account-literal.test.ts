import { describe, expect, it } from 'vitest';
import {
  isEncodedAccountLiteral,
  isAccountSelectorLiteral,
  normalizeDisplayedAccountSelectorLiteral,
  isEncodedAssetLiteral,
  normalizeAccountAliasLiteral,
  normalizeAccountIdLiteral,
  normalizeAccountSelectorLiteral,
  normalizeEncodedAccountLiteral,
  normalizeLooseAccountLiteral,
  normalizeToriiAccountSelectorLiteral,
  parseAccountAliasLiteral,
} from './account-literal';

const SAMPLE_I105 =
  'soraゴヂアニィルサフユイサヹピビレッデヹボテハキョメベチュヒャネィギチュヲベァヱェベモネェネツデトツオチハセ';
const SAMPLE_I105_ALT =
  'soraゴヂアヌペゲクュリショィィョオチャデォブェニュプピニュトトャヘヒュチャマヵニャベヱャヅロョケヨネトイナヘタケヒ';
const SAMPLE_I105_MODERN = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const MIXED_TORSION_I105 = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
const SAMPLE_I105_MODERN_FULLWIDTH = 'sorauロ1NラhBUd2BツヲトiヤニツヌKSテaリメモQラrメoリナnウリbQウQJニLJ5HSE';
const SAMPLE_I105_TEST_MODERN = 'testuﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ALIAS = 'Treasury@Banking.Retail';
const SAMPLE_NORITO_ACCOUNT = 'norito:4e52543000000001';
const SAMPLE_NORITO_ASSET = 'norito:4e52543000000002';

describe('account literal helpers', () => {
  it('preserves exact halfwidth I105 selector text', () => {
    expect(normalizeAccountIdLiteral(SAMPLE_I105_MODERN)).toBe(SAMPLE_I105_MODERN);
    expect(normalizeEncodedAccountLiteral(`  ${SAMPLE_I105_MODERN}  `)).toBe(SAMPLE_I105_MODERN);
  });

  it('normalizes canonical account aliases', () => {
    expect(normalizeAccountAliasLiteral(SAMPLE_ALIAS)).toBe('treasury@banking.retail');
    expect(parseAccountAliasLiteral(SAMPLE_ALIAS)).toEqual({
      literal: 'treasury@banking.retail',
      label: 'treasury',
      domain: 'banking',
      dataspace: 'retail',
    });
    expect(normalizeAccountAliasLiteral('Primary@Retail')).toBe('primary@retail');
  });

  it('rejects malformed account ids and aliases', () => {
    expect(normalizeEncodedAccountLiteral(`sora:${SAMPLE_I105}`)).toBeNull();
    expect(normalizeAccountIdLiteral(SAMPLE_I105)).toBeNull();
    expect(normalizeAccountIdLiteral(SAMPLE_I105_ALT)).toBeNull();
    expect(normalizeAccountIdLiteral(SAMPLE_I105_MODERN_FULLWIDTH)).toBeNull();
    expect(normalizeAccountIdLiteral('sorauﾛ1Nﾗ0BUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE')).toBeNull();
    expect(normalizeAccountIdLiteral('sorauﾛ1NﾗOBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE')).toBeNull();
    expect(normalizeAccountIdLiteral('sorauﾛ1NﾗlBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE')).toBeNull();
    expect(normalizeAccountIdLiteral('sora1')).toBeNull();
    expect(normalizeAccountIdLiteral('alice@wonderland')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice@wonder.land.ops')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice@@retail')).toBeNull();
    expect(normalizeAccountSelectorLiteral('rose#main')).toBeNull();
    expect(normalizeEncodedAccountLiteral(SAMPLE_NORITO_ACCOUNT)).toBeNull();
    expect(normalizeEncodedAccountLiteral('norito:not-hex')).toBeNull();
  });

  it('accepts canonical ids or aliases as account selectors', () => {
    expect(normalizeLooseAccountLiteral(SAMPLE_I105_MODERN)).toBe(SAMPLE_I105_MODERN);
    expect(normalizeLooseAccountLiteral(SAMPLE_ALIAS)).toBe('treasury@banking.retail');
    expect(normalizeAccountSelectorLiteral('Primary@Retail')).toBe('primary@retail');
    expect(normalizeLooseAccountLiteral('rose#main#alice@wonderland')).toBeNull();
    expect(normalizeLooseAccountLiteral('??')).toBeNull();
  });

  it('preserves encoded account selectors without rewriting their network prefix', () => {
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_I105_TEST_MODERN)).toBe(SAMPLE_I105_TEST_MODERN);
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_I105_MODERN, 'https://taira.sora.org')).toBe(SAMPLE_I105_MODERN);
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_I105_TEST_MODERN, 'https://nexus.mof3.sora.org:18080')).toBe(
      SAMPLE_I105_TEST_MODERN
    );
  });

  it('keeps aliases intact when normalizing account selectors for Torii', () => {
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_ALIAS)).toBe('treasury@banking.retail');
    expect(normalizeToriiAccountSelectorLiteral('??')).toBeNull();
  });

  it('preserves displayed account ids without rewriting their network prefix', () => {
    expect(normalizeDisplayedAccountSelectorLiteral(SAMPLE_I105_MODERN, 'https://taira.sora.org')).toBe(
      SAMPLE_I105_MODERN
    );
    expect(normalizeDisplayedAccountSelectorLiteral(SAMPLE_I105_TEST_MODERN, 'https://nexus.mof3.sora.org:18080')).toBe(
      SAMPLE_I105_TEST_MODERN
    );
    expect(normalizeDisplayedAccountSelectorLiteral(SAMPLE_ALIAS, 'https://taira.sora.org')).toBe(
      'treasury@banking.retail'
    );
  });

  it('detects canonical ids, selectors, and norito asset literals', () => {
    expect(isEncodedAccountLiteral(SAMPLE_I105_MODERN)).toBe(true);
    expect(isEncodedAccountLiteral(SAMPLE_I105)).toBe(false);
    expect(isEncodedAccountLiteral(SAMPLE_ALIAS)).toBe(false);
    expect(isEncodedAccountLiteral(SAMPLE_NORITO_ACCOUNT)).toBe(false);
    expect(isEncodedAccountLiteral('alice@retail')).toBe(false);
    expect(isAccountSelectorLiteral(SAMPLE_ALIAS)).toBe(true);
    expect(isAccountSelectorLiteral('alice@retail')).toBe(true);

    expect(isEncodedAssetLiteral(SAMPLE_NORITO_ASSET)).toBe(true);
    expect(isEncodedAssetLiteral('usd#main')).toBe(false);
  });

  it('leaves cryptographic identity admission to Torii instead of invoking the unavailable native codec', () => {
    const invalidChecksum = `${SAMPLE_I105_MODERN.slice(0, -1)}F`;
    expect(normalizeAccountIdLiteral(invalidChecksum)).toBe(invalidChecksum);
    expect(normalizeAccountIdLiteral(MIXED_TORSION_I105)).toBe(MIXED_TORSION_I105);
  });

  it('rejects whitespace, aliases and delimiters without rewriting request selectors', () => {
    expect(normalizeAccountIdLiteral(` ${SAMPLE_I105_MODERN}`)).toBeNull();
    expect(normalizeAccountIdLiteral(`${SAMPLE_I105_MODERN} `)).toBeNull();
    expect(normalizeAccountIdLiteral(`${SAMPLE_I105_MODERN}\n`)).toBeNull();
    expect(normalizeAccountIdLiteral(`${SAMPLE_I105_MODERN}@retail`)).toBeNull();
    expect(normalizeAccountIdLiteral(`${SAMPLE_I105_MODERN}/extra`)).toBeNull();
  });
});
