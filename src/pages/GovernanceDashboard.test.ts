import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import type * as VueUseCore from '@vueuse/core';
import GovernanceDashboard from './GovernanceDashboard.vue';
import { i18n } from '@/shared/lib/localization';

const refetchFn = vi.fn();
const useIntervalResume = vi.fn();
const useIntervalPause = vi.fn();

vi.mock('@/shared/ui/composables/useGovernanceMetrics', () => ({
  useGovernanceMetrics: () => ({
    council: ref({ epoch: 1, members: [] }),
    unlockStats: ref(null),
    isCouncilLoading: ref(false),
    isUnlocksLoading: ref(false),
  }),
}));

vi.mock('@/shared/ui/composables/useGovernanceEvents', () => ({
  useGovernanceEvents: () => ({ data: ref(null), status: ref('OPEN') }),
}));

vi.mock('@vue-kakuyaku/core', () => ({
  useParamScope: () =>
    ref({
      expose: {
        refetch: refetchFn,
        isLoading: false,
        data: null,
      },
    }),
}));

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUseCore>('@vueuse/core');
  return {
    ...actual,
    useIntervalFn: () => ({
      pause: useIntervalPause,
      resume: useIntervalResume,
    }),
  };
});

describe('GovernanceDashboard', () => {
  beforeEach(() => {
    refetchFn.mockClear();
    useIntervalResume.mockClear();
    useIntervalPause.mockClear();
  });

  it('auto-refetches governance data when a referendum is active and starts interval', async () => {
    const wrapper = mount(GovernanceDashboard, {
      global: {
        plugins: [i18n],
        stubs: ['BaseContentBlock', 'BaseLoading', 'BaseHash', 'BaseLink', 'BaseButton', 'BaseTable'],
      },
    });

    // set a referendum id to activate refresh
    (wrapper.vm as any).referendumQuery.id = '42';
    await nextTick();

    expect(refetchFn).toHaveBeenCalled();
    expect(useIntervalResume).toHaveBeenCalled();
    expect(useIntervalPause).toHaveBeenCalled();
  });
});
