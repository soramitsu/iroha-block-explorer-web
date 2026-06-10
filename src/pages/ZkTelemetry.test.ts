import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import ZkTelemetry from './ZkTelemetry.vue';
import { i18n } from '@/shared/lib/localization';
import type * as VueUse from '@vueuse/core';

const proofStreamData = ref<string | null>(null);
const proofStreamSources: unknown[] = [];

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUse>('@vueuse/core');
  return {
    ...actual,
    useEventSource: (source: unknown) => {
      proofStreamSources.push(source);
      return {
        data: proofStreamData,
        status: ref('OPEN'),
      };
    },
  };
});

vi.mock('@/shared/utils/setup-async-data', () => ({
  setupAsyncData: vi.fn(() => ({
    isLoading: false,
    data: undefined,
    refetch: vi.fn(),
  })),
}));

const BaseContentBlockStub = {
  name: 'BaseContentBlock',
  template: '<div><slot /></div>',
};

const BaseTableStub = {
  name: 'BaseTable',
  props: ['items', 'loading', 'rowKey'],
  template: '<div><slot name="row" v-for="item in items" :item="item" /></div>',
};

const BaseHashStub = {
  name: 'BaseHash',
  props: ['hash'],
  template: '<span>{{ hash }}</span>',
};

const TimeStampStub = {
  name: 'TimeStamp',
  template: '<time />',
};

describe('ZkTelemetry', () => {
  beforeEach(() => {
    proofStreamData.value = null;
    proofStreamSources.splice(0, proofStreamSources.length);
  });

  it('opens the proof EventSource against the current /v1 events SSE route', () => {
    const wrapper = mount(ZkTelemetry, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          TimeStamp: TimeStampStub,
        },
      },
    });

    expect((proofStreamSources[0] as { value?: string }).value).toContain('/v1/events/sse');
    wrapper.unmount();
  });

  it('preserves window scroll position when prepending proof events while scrolled down', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => 200,
    });
    expect(window.scrollY).toBe(200);

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => document.querySelectorAll('.zk-telemetry-page__row').length * 100,
    });

    const wrapper = mount(ZkTelemetry, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: {
          BaseContentBlock: BaseContentBlockStub,
          BaseTable: BaseTableStub,
          BaseHash: BaseHashStub,
          TimeStamp: TimeStampStub,
        },
      },
    });

    await flushPromises();
    expect(wrapper.findAll('.zk-telemetry-page__row')).toHaveLength(0);

    proofStreamData.value = JSON.stringify({
      category: 'Data',
      event: 'ProofVerified',
      backend: 'test',
      proof_hash: '0xproof',
    });

    await flushPromises();
    await nextTick();
    await flushPromises();
    expect(wrapper.findAll('.zk-telemetry-page__row')).toHaveLength(1);

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 300 }));

    scrollToSpy.mockRestore();
    wrapper.unmount();
  });
});
