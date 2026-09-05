import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import type { TabInstructions } from '@/features/filter/transactions/model';
import { INSTRUCTION_OPTIONS } from '@/features/filter/transactions/model';
import { i18n } from '@/shared/lib/localization';
import BaseTabs from '@/shared/ui/components/BaseTabs.vue';
import { ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS } from '@/features/filter/transactions/adaptive-options';

test.each([
  [1700, 4],
  [1440, 3],
  [1200, 2],
  [960, 5],
  [640, 2],
  [480, 3],
  [365, 2],
])('BaseTabs adaptive display correctness', async (windowWidth, expectedTabs) => {
  const model = ref<TabInstructions>('All');

  window.innerWidth = windowWidth;

  const wrapper = mount(BaseTabs, {
    props: {
      items: INSTRUCTION_OPTIONS,
      modelValue: model.value,
      adaptiveOptions: ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS,
    },
    global: {
      plugins: [i18n],
    },
  });

  expect(wrapper.findAll('.base-tabs__tab').length).toBe(expectedTabs);
});

function mountTabs() {
  return mount(BaseTabs, {
    props: {
      items: INSTRUCTION_OPTIONS.slice(0, 3),
      modelValue: 'All',
    },
    global: {
      plugins: [i18n],
    },
  });
}

describe('BaseTabs keyboard accessibility', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dir');
  });

  it('renders literal labels without passing them through localization', () => {
    const wrapper = mount(BaseTabs, {
      props: {
        items: [
          { label: 'Overview', value: 'overview' },
          { label: 'Effective permissions', value: 'permissions' },
        ],
        modelValue: 'overview',
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Overview',
      'Effective permissions',
    ]);
  });

  it('uses a tablist with native buttons and one roving tab stop', () => {
    const wrapper = mountTabs();
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('View options');

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('activates and focuses adjacent, first, and last tabs from the keyboard', async () => {
    const wrapper = mountTabs();
    const tabs = wrapper.findAll('[role="tab"]');
    const focusSecond = vi.spyOn(tabs[1]!.element as HTMLButtonElement, 'focus');
    const focusFirst = vi.spyOn(tabs[0]!.element as HTMLButtonElement, 'focus');
    const focusLast = vi.spyOn(tabs[2]!.element as HTMLButtonElement, 'focus');

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Register']);
    expect(focusSecond).toHaveBeenCalledOnce();

    await tabs[1]!.trigger('keydown', { key: 'Home' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['All']);
    expect(focusFirst).toHaveBeenCalledOnce();

    await tabs[0]!.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Unregister']);
    expect(focusLast).toHaveBeenCalledOnce();
  });

  it('reverses horizontal arrow behavior in RTL and wraps at the ends', async () => {
    document.documentElement.dir = 'rtl';
    const wrapper = mountTabs();
    const tabs = wrapper.findAll('[role="tab"]');

    await tabs[0]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Register']);

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Unregister']);
  });

  it('uses native buttons for both adaptive-window controls', async () => {
    window.innerWidth = 1200;
    const wrapper = mount(BaseTabs, {
      props: {
        items: INSTRUCTION_OPTIONS,
        modelValue: 'All',
        adaptiveOptions: ACCOUNT_INSTRUCTIONS_ADAPTIVE_OPTIONS,
      },
      global: {
        plugins: [i18n],
      },
    });

    const next = wrapper.get('[data-testid="next"]');
    expect(next.element.tagName).toBe('BUTTON');
    expect(next.attributes('aria-label')).toBe('Next tabs');
    await next.trigger('click');

    const previous = wrapper.get('[data-testid="prev"]');
    expect(previous.element.tagName).toBe('BUTTON');
    expect(previous.attributes('aria-label')).toBe('Previous tabs');
  });
});
