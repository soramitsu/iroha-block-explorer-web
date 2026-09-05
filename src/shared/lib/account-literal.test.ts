import { describe, expect, it } from 'vitest';
import {
  isEncodedAccountLiteral,
  isEncodedAssetLiteral,
  normalizeAccountAliasLiteral,
  normalizeAccountIdLiteral,
  normalizeEncodedAccountLiteral,
  normalizeToriiAccountSelectorLiteral,
  parseAccountAliasLiteral,
  renderCanonicalAccountIdLiteralFromPublicKeyLiteral,
  renderCanonicalPublicKeyLiteralFromAccountIdLiteral,
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
const SAMPLE_ED25519_PUBLIC_KEY = 'ed01201509A611AD6D97B01D871E58ED00C8FD7C3917B6CA61A8C2833A19E000AAC2E4';
const SAMPLE_SECP256K1_PUBLIC_KEY = 'e701210312273E8810581E58948D3FB8F9E8AD53AAA21492EBB8703915BBB565A21B7FCC';

describe('account literal helpers', () => {
  it('normalizes canonical halfwidth i105 account ids only', () => {
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
    expect(normalizeAccountIdLiteral(`${SAMPLE_I105_MODERN.slice(0, -1)}F`)).toBeNull();
    expect(normalizeAccountIdLiteral(MIXED_TORSION_I105)).toBeNull();
    expect(normalizeAccountIdLiteral('alice@wonderland')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice@wonder.land.ops')).toBeNull();
    expect(normalizeAccountAliasLiteral('alice@@retail')).toBeNull();
    expect(normalizeEncodedAccountLiteral(SAMPLE_NORITO_ACCOUNT)).toBeNull();
    expect(normalizeEncodedAccountLiteral('norito:not-hex')).toBeNull();
  });

  it('preserves canonical ids for the explicit multisig selector contract', () => {
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_I105_TEST_MODERN)).toBe(SAMPLE_I105_TEST_MODERN);
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_I105_MODERN)).toBe(SAMPLE_I105_MODERN);
  });

  it('keeps aliases only for the explicit multisig selector contract', () => {
    expect(normalizeToriiAccountSelectorLiteral(SAMPLE_ALIAS)).toBe('treasury@banking.retail');
    expect(normalizeToriiAccountSelectorLiteral('??')).toBeNull();
  });

  it('detects canonical ids and Norito asset literals', () => {
    expect(isEncodedAccountLiteral(SAMPLE_I105_MODERN)).toBe(true);
    expect(isEncodedAccountLiteral(SAMPLE_I105)).toBe(false);
    expect(isEncodedAccountLiteral(SAMPLE_ALIAS)).toBe(false);
    expect(isEncodedAccountLiteral(SAMPLE_NORITO_ACCOUNT)).toBe(false);
    expect(isEncodedAccountLiteral('alice@retail')).toBe(false);
    expect(isEncodedAssetLiteral(SAMPLE_NORITO_ASSET)).toBe(true);
    expect(isEncodedAssetLiteral('usd#main')).toBe(false);
  });

  it('renders canonical i105 ids from supported single-key public-key multihashes', () => {
    const edBare = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY);
    const edPrefixed = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(`ed25519:${SAMPLE_ED25519_PUBLIC_KEY}`);
    const secp = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_SECP256K1_PUBLIC_KEY);

    expect(edBare).not.toBeNull();
    expect(edPrefixed).toBe(edBare);
    expect(edBare?.startsWith('sora')).toBe(true);
    expect(normalizeAccountIdLiteral(edBare!)).toBe(edBare);

    expect(secp).not.toBeNull();
    expect(secp?.startsWith('sora')).toBe(true);
    expect(normalizeAccountIdLiteral(secp!)).toBe(secp);
    expect(secp).not.toBe(edBare);
  });

  it('decodes modern canonical i105 ids back into canonical public-key multihashes', () => {
    const edAccountId = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_ED25519_PUBLIC_KEY);
    const secpAccountId = renderCanonicalAccountIdLiteralFromPublicKeyLiteral(SAMPLE_SECP256K1_PUBLIC_KEY);

    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(edAccountId!)).toBe(
      SAMPLE_ED25519_PUBLIC_KEY.toUpperCase()
    );
    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(secpAccountId!)).toBe(
      SAMPLE_SECP256K1_PUBLIC_KEY.toUpperCase()
    );
  });

  it('rejects noncanonical or malformed i105 ids when decoding back into public keys', () => {
    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(SAMPLE_I105)).toBeNull();
    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(SAMPLE_I105_MODERN_FULLWIDTH)).toBeNull();
    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(SAMPLE_ALIAS)).toBeNull();
    expect(renderCanonicalPublicKeyLiteralFromAccountIdLiteral(`${SAMPLE_I105_MODERN}x`)).toBeNull();
  });

  it('rejects malformed or unsupported public-key multihashes when rendering i105 ids', () => {
    expect(renderCanonicalAccountIdLiteralFromPublicKeyLiteral('')).toBeNull();
    expect(renderCanonicalAccountIdLiteralFromPublicKeyLiteral('ed0120ZZ')).toBeNull();
    expect(
      renderCanonicalAccountIdLiteralFromPublicKeyLiteral(
        'bls:ed01201509A611AD6D97B01D871E58ED00C8FD7C3917B6CA61A8C2833A19E000AAC2E4'
      )
    ).toBeNull();
    expect(
      renderCanonicalAccountIdLiteralFromPublicKeyLiteral(
        'ea01201509A611AD6D97B01D871E58ED00C8FD7C3917B6CA61A8C2833A19E000AAC2E4'
      )
    ).toBeNull();
  });
});
