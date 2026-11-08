import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ThemeSwitcher from './ThemeSwitcher.vue';

vi.mock('@/shared/api', () => ({ isToriiBaseUrlForced: () => false }));

describe('ThemeSwitcher', () => {
  let wrapper: VueWrapper | undefined;
  let preferredDark: boolean;
  let mediaQueries: EventTarget[];

  beforeEach(() => {
    vi.useFakeTimers();
    preferredDark = false;
    mediaQueries = [];
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('theme-transition');
    vi.stubGlobal('matchMedia', vi.fn((query: string) => {
      const result = new EventTarget();
      Object.defineProperties(result, {
        media: { value: query },
        matches: { get: () => query === '(prefers-color-scheme: dark)' && preferredDark },
      });
      mediaQueries.push(result);
      return result;
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('theme-transition');
  });

  function mountSwitcher() {
    return mount(ThemeSwitcher, { global: {
      mocks: { $t: () => 'Theme switcher' },
      stubs: { RouterLink: true },
    } });
  }

  it.each([false, true])('shows the current system theme when dark is %s', async (dark) => {
    preferredDark = dark;
    wrapper = mountSwitcher();
    await nextTick();
    expect(wrapper.get('button').attributes('aria-label')).toBe('Theme switcher');
    expect(wrapper.get('button').attributes('aria-pressed')).toBe(String(dark));
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe(dark ? 'dark' : 'light');
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg').attributes('focusable')).toBe('false');
    expect(wrapper.findAll('svg')).toHaveLength(1);
    expect(document.documentElement.classList.contains('dark')).toBe(dark);
  });

  it('updates the icon when the system preference changes in automatic mode', async () => {
    wrapper = mountSwitcher();
    await nextTick();
    preferredDark = true;
    for (const query of mediaQueries) {
      query.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    }
    await nextTick();
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe('dark');
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
  });

  it.each(['light', 'dark'])('keeps the saved %s preference over the system preference', async (saved) => {
    preferredDark = saved === 'light';
    localStorage.setItem('vueuse-color-scheme', saved);
    wrapper = mountSwitcher();
    await nextTick();
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe(saved);
    expect(wrapper.get('button').attributes('aria-pressed')).toBe(String(saved === 'dark'));
    expect(localStorage.getItem('vueuse-color-scheme')).toBe(saved);
  });

  it('persists toggling to dark and ignores a rapid second click until the transition ends', async () => {
    wrapper = mountSwitcher();
    await nextTick();
    const button = wrapper.get('button');
    await button.trigger('click');
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe('dark');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.attributes('aria-label')).toBe('Theme switcher');
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('dark');
    expect(document.body.classList.contains('theme-transition')).toBe(true);

    await button.trigger('click');
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe('dark');
    await vi.advanceTimersByTimeAsync(300);
    expect(document.body.classList.contains('theme-transition')).toBe(false);

    await button.trigger('click');
    expect(wrapper.get('svg').attributes('data-theme-icon')).toBe('light');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('auto');
  });
});
