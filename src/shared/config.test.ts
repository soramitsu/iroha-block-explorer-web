import { describe, expect, it } from 'vitest';
import { menu } from './config';

describe('navigation config', () => {
  it('includes tracing menu entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'tracing.nav',
          to: '/tracing',
          names: ['tracing-workspace'],
        }),
      ])
    );
  });

  it('includes soracloud menu entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'soracloud.nav',
          to: '/soracloud',
          names: ['soracloud'],
        }),
      ])
    );
  });

  it('includes VPN menu entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'vpn.nav',
          to: '/vpn',
          names: ['vpn-stats'],
        }),
      ])
    );
  });

  it('includes smart contracts menu entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'contracts.nav',
          to: '/contracts',
          names: ['smart-contracts'],
        }),
      ])
    );
  });
});
