<template>
  <div class="kaigi-relays-events">
    <div class="kaigi-relays-events__header">
      <h4>{{ $t('kaigi.liveEvents') }}</h4>
      <div class="kaigi-relays-events__filters">
        <label>
          {{ $t('kaigi.filterDomain') }}
          <input
            v-model="filters.domain"
            class="kaigi-relays-events__input"
            type="text"
          >
        </label>
        <label>
          {{ $t('kaigi.filterRelay') }}
          <input
            v-model="filters.relay"
            class="kaigi-relays-events__input"
            type="text"
          >
        </label>
      </div>
    </div>

    <div
      v-if="status === 'OPEN'"
      class="kaigi-relays-events__status kaigi-relays-events__status--connected"
    >
      {{ $t('kaigi.eventsConnected') }}
    </div>
    <div
      v-else
      class="kaigi-relays-events__status"
    >
      {{ $t('kaigi.eventsConnecting') }}
    </div>

    <ul
      ref="listEl"
      class="kaigi-relays-events__list"
    >
      <li
        v-for="event in filteredEvents"
        :key="event.id"
        class="kaigi-relays-events__item"
      >
        <div class="kaigi-relays-events__item-header">
          <span class="kaigi-relays-events__item-kind">{{ formatKind(event.kind) }}</span>
          <TimeStamp :value="event.timestamp" />
        </div>
        <div class="kaigi-relays-events__details">
          <span>{{ event.domain }} / {{ event.relay }}</span>
        </div>
        <BaseJson
          class="kaigi-relays-events__payload"
          :value="event.payload"
        />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useEventSource } from '@vueuse/core';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';
import BaseJson from '@/shared/ui/components/BaseJson.vue';
import { useI18n } from 'vue-i18n';
import type { KaigiRelayEvent } from '@/shared/lib/kaigi';
import { parseKaigiRelayEvent } from '@/shared/lib/kaigi';

interface KaigiRelayEventItem extends KaigiRelayEvent {
  id: string
}

const props = defineProps<{
  streamUrl: string
}>();

const emit = defineEmits<(event: 'event', value: KaigiRelayEvent) => void>();

const filters = reactive({
  domain: '',
  relay: '',
});

const listEl = ref<HTMLElement | null>(null);

const { t } = useI18n();
const { data, status } = useEventSource(props.streamUrl, []);

const events = reactive<KaigiRelayEventItem[]>([]);
let seq = 0;

watch(data, async (value) => {
  if (!value) return;
  const el = listEl.value;
  const shouldPreserveScroll = Boolean(el && el.scrollTop > 0);
  const beforeScrollHeight = shouldPreserveScroll ? (el as HTMLElement).scrollHeight : 0;
  const beforeScrollTop = shouldPreserveScroll ? (el as HTMLElement).scrollTop : 0;

  const receivedAt = new Date();
  const event = parseKaigiRelayEvent(value, receivedAt);
  if (!event) return;

  seq += 1;
  events.unshift({
    id: `${receivedAt.getTime()}-${seq}`,
    ...event,
  });
  emit('event', event);

  if (events.length > 50) {
    events.pop();
  }

  // Avoid the "jump" effect while the user is reading older events in the scroll container.
  if (shouldPreserveScroll && el) {
    await nextTick();
    const afterScrollHeight = el.scrollHeight;
    el.scrollTop = beforeScrollTop + (afterScrollHeight - beforeScrollHeight);
  }
});

const filteredEvents = computed(() =>
  events.filter((event) => {
    const domainOk = filters.domain
      ? event.domain.toLowerCase().includes(filters.domain.toLowerCase())
      : true;
    const relayOk = filters.relay
      ? event.relay.toLowerCase().includes(filters.relay.toLowerCase())
      : true;
    return domainOk && relayOk;
  })
);

function formatKind(kind: string) {
  return t(`kaigi.eventKinds.${kind}`, kind);
}
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.kaigi-relays-events {
  border: 1px solid theme-color('border-primary');
  border-radius: size(2);
  padding: size(3);
  display: flex;
  flex-direction: column;
  gap: size(2);

  &__header {
    display: flex;
    justify-content: space-between;
    gap: size(2);
    align-items: center;
    flex-wrap: wrap;
  }

  &__filters {
    display: flex;
    gap: size(2);
    flex-wrap: wrap;
  }

  &__input {
    display: block;
    margin-top: size(1);
    padding: size(1);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
  }

  &__status {
    font-size: size(1.5);
    color: theme-color('content-tertiary');

    &--connected {
      color: theme-color('success');
    }
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: size(2);
    max-height: 480px;
    overflow-y: auto;
  }

  &__item {
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    padding: size(2);
  }

  &__item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__item-kind {
    font-weight: 600;
    text-transform: capitalize;
  }

  &__payload {
    margin-top: size(1);
  }
}
</style>
