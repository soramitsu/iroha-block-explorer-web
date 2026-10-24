import { describe, expect, it } from 'vitest';
import { dashboardsMenuItem, menu, menuGroups } from './config';
import { routes } from '@/app/router';

const registeredRouteNames = new Set(routes.flatMap((route) => ('name' in route && route.name ? [String(route.name)] : [])));
const groupedItems = menuGroups.flatMap((group) => group.items);
const groupedRouteNames = groupedItems.flatMap((item) => item.names);
const groupedDestinations = groupedItems.map((item) => item.to);

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

  it('groups every home-page destination exactly once in the header', () => {
    const grouped = groupedDestinations;
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const item of menu) expect(grouped).toContain(item.to);
    expect(grouped).toContain(dashboardsMenuItem.to);
    expect(grouped).toHaveLength(menu.length + 1);
  });

  it('keeps the home-page menu free of header-only destinations', () => {
    expect(menu.map((item) => item.to)).not.toContain(dashboardsMenuItem.to);
  });

  it('names only routes that exist', () => {
    for (const name of groupedRouteNames) expect(registeredRouteNames.has(name), name).toBe(true);
  });
});
