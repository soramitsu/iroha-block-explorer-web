import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import KaigiRelayEvents from './KaigiRelayEvents.vue';
import { i18n } from '@/shared/lib/localization';
import type * as VueUse from '@vueuse/core';

const eventSourceData = ref<string | null>(null);

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof VueUse>('@vueuse/core');
  return {
    ...actual,
    useEventSource: () => ({
      data: eventSourceData,
      status: ref('OPEN'),
    }),
  };
});

const TimeStampStub = {
  name: 'TimeStamp',
  template: '<time />',
};

const BaseJsonStub = {
  name: 'BaseJson',
  template: '<pre />',
};

describe('KaigiRelayEvents', () => {
  beforeEach(() => {
    eventSourceData.value = null;
  });

  it('preserves scroll position when prepending new events while scrolled down', async () => {
    const wrapper = mount(KaigiRelayEvents, {
      props: {
        streamUrl: 'http://example.test/stream',
      },
      global: {
        plugins: [i18n],
        stubs: {
          TimeStamp: TimeStampStub,
          BaseJson: BaseJsonStub,
        },
      },
    });

    await flushPromises();

    const list = wrapper.get('.kaigi-relays-events__list').element as HTMLElement;

    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => list.querySelectorAll('li').length * 100,
    });

    list.scrollTop = 50;

    eventSourceData.value = JSON.stringify({
      kind: 'registration',
      domain: 'wonderland',
      relay_id: 'relay-1',
      reported_at_ms: Date.now(),
    });

    await flushPromises();

    expect(list.scrollTop).toBe(150);
  });
});
