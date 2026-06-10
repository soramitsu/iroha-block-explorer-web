import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/shared/lib/localization';
import { useLangDropdown } from '@/shared/ui/composables/header-portal';
import LangDropdown from './LangDropdown.vue';

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

describe('LangDropdown', () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    installLocalStorageMock();

    document.body.innerHTML = '';

    const dropdown = useLangDropdown();
    if (dropdown.isOpen.value) dropdown.toggle();
  });

  afterEach(() => {
    const dropdown = useLangDropdown();
    if (dropdown.isOpen.value) dropdown.toggle();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('closes when clicking the trigger button again', async () => {
    const wrapper = mount(LangDropdown, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: {
          RouterLink: true,
        },
      },
    });

    const button = wrapper.get('.lang-dropdown__button');

    await button.trigger('click');
    await nextTick();
    expect(document.body.querySelector('.lang-dropdown__window.base-dropdown-window')).not.toBeNull();

    await button.trigger('click');
    await nextTick();
    await nextTick();
    expect(document.body.querySelector('.lang-dropdown__window.base-dropdown-window')).toBeNull();
  });

  it('anchors the teleported dropdown near the trigger button position', async () => {
    const innerWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1000,
    });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockedRect(this: HTMLElement) {
      if (this.classList.contains('lang-dropdown__button')) {
        return new DOMRect(900, 8, 80, 32);
      }

      if (this.classList.contains('lang-dropdown__window')) {
        return new DOMRect(0, 0, 220, 280);
      }

      return originalGetBoundingClientRect.call(this);
    });

    const wrapper = mount(LangDropdown, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: {
          RouterLink: true,
        },
      },
    });

    await wrapper.get('.lang-dropdown__button').trigger('click');
    await nextTick();
    await nextTick();

    const dropdown = document.body.querySelector('.lang-dropdown__window.base-dropdown-window') as HTMLElement | null;
    expect(dropdown).not.toBeNull();
    expect(dropdown?.style.top).toBe('48px');
    expect(dropdown?.style.left).toBe('760px');

    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    }
  });
});
