import { describe, expect, it } from 'vitest';
import { intlLocale } from './intl-locale';

describe('intlLocale', () => {
  it('maps app codes that are not BCP 47 tags', () => {
    expect(intlLocale('jp')).toBe('ja');
    expect(intlLocale('kh')).toBe('km');
  });

  it('keeps valid tags and falls back to English otherwise', () => {
    expect(intlLocale('zh-TW')).toBe('zh-TW');
    expect(intlLocale('de')).toBe('de');
    expect(intlLocale('akk')).toBe('en');
    expect(intlLocale('not a tag')).toBe('en');
  });
});
