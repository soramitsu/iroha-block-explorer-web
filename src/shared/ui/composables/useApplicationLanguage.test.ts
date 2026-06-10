import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/shared/lib/localization';
import { useApplicationLanguage } from './useApplicationLanguage';

const TestComponent = {
  template: '<div />',
  setup() {
    return useApplicationLanguage();
  },
};

function installLocalStorageMock() {
  const store: Record<string, string> = {};
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
    key: vi.fn(),
    length: 0,
  };
}

describe('useApplicationLanguage', () => {
  beforeEach(() => {
    installLocalStorageMock();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    document.body.classList.remove('rtl');
  });

  it('sets RTL direction and body class for RTL locales', async () => {
    const wrapper = mount(TestComponent, {
      global: { plugins: [i18n] },
    });

    const composable = wrapper.vm as any;
    await composable.setApplicationCurrency('ar');
    await nextTick();

    expect(composable.language).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.body.classList.contains('rtl')).toBe(true);
  });

  it('sets LTR direction and removes RTL class for LTR locales', async () => {
    const wrapper = mount(TestComponent, {
      global: { plugins: [i18n] },
    });

    const composable = wrapper.vm as any;
    await composable.setApplicationCurrency('en');
    await nextTick();

    expect(composable.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.body.classList.contains('rtl')).toBe(false);
  });

  it('keeps old Akkadian locale as LTR while applying lang attribute', async () => {
    const wrapper = mount(TestComponent, {
      global: { plugins: [i18n] },
    });

    const composable = wrapper.vm as any;
    await composable.setApplicationCurrency('akk');
    await nextTick();

    expect(composable.language).toBe('akk');
    expect(document.documentElement.lang).toBe('akk');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.body.classList.contains('rtl')).toBe(false);
  });

  it('keeps ancient Egyptian locale as LTR while applying lang attribute', async () => {
    const wrapper = mount(TestComponent, {
      global: { plugins: [i18n] },
    });

    const composable = wrapper.vm as any;
    await composable.setApplicationCurrency('egy');
    await nextTick();

    expect(composable.language).toBe('egy');
    expect(document.documentElement.lang).toBe('egy');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.body.classList.contains('rtl')).toBe(false);
  });
});
