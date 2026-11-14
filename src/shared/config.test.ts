import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './lib/localization';
import { langOptions, menu } from './config';

describe('navigation config', () => {
  it('offers exactly the locales backed by complete catalogs', () => {
    expect(langOptions.map(({ value }) => value).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

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

  it('includes the system-parameters snapshot entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'parameters.nav',
          to: '/parameters',
          names: ['system-parameters'],
        }),
      ])
    );
  });

  it('includes the Soracles workspace entry', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'soracles.nav',
          to: '/soracles',
          names: ['soracles'],
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

  it('links directly to the current ZK registry route', () => {
    expect(menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          i18nKey: 'zkRegistry.nav',
          to: '/zk/registry',
          names: ['zk-registry'],
        }),
      ])
    );
    expect(menu).not.toEqual(expect.arrayContaining([expect.objectContaining({ to: '/zk/telemetry' })]));
  });
});
