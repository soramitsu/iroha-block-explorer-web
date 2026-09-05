import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import BaseResourceState from './BaseResourceState.vue';
import { i18n } from '@/shared/lib/localization';
import type { ResourceSnapshot } from '@/shared/utils/resource-state';

function mountState(snapshot: ResourceSnapshot<unknown>) {
  return mount(BaseResourceState, {
    props: { snapshot },
    slots: {
      default: '<div data-test="content">ready content</div>',
    },
    global: {
      plugins: [i18n],
      stubs: {
        BaseLoading: { template: '<span data-test="loading" />' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('BaseResourceState', () => {
  it('renders explicit loading and not-found states without ready content', () => {
    const loading = mountState({ status: 'initial-loading' });
    expect(loading.get('[role="status"]').text()).toContain('Loading');
    expect(loading.find('[data-test="content"]').exists()).toBe(false);

    const notFound = mountState({ status: 'not-found' });
    expect(notFound.get('[role="status"]').text()).toContain('No data');
    expect(notFound.find('[data-test="content"]').exists()).toBe(false);
  });

  it('renders an error with an explicit retry action', async () => {
    const wrapper = mountState({
      status: 'error',
      problem: { kind: 'network', message: 'offline' },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('Unknown error');
    await wrapper.get('[data-test="resource-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('keeps ready data visible while surfacing refresh progress or failure', async () => {
    const refreshing = mountState({
      status: 'ready',
      data: { value: 1 },
      isRefreshing: true,
      refreshError: null,
    });
    expect(refreshing.get('[data-test="content"]').text()).toBe('ready content');
    expect(refreshing.get('[aria-busy="true"]')).toBeTruthy();

    const failed = mountState({
      status: 'ready',
      data: { value: 1 },
      isRefreshing: false,
      refreshError: { kind: 'timeout', message: 'timed out' },
    });
    expect(failed.get('[data-test="content"]').text()).toBe('ready content');
    expect(failed.get('[role="alert"]').text()).toContain('Unknown error');
    await failed.get('[data-test="resource-refresh-retry"]').trigger('click');
    expect(failed.emitted('retry')).toHaveLength(1);
  });
});
