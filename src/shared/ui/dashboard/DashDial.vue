<template>
  <figure
    class="dash-dial"
    role="img"
    :aria-label
  >
    <svg
      class="dash-dial__svg"
      viewBox="0 0 220 212"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          :id="bezelId"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            class="dash-dial__bezel-light"
          />
          <stop
            offset="1"
            class="dash-dial__bezel-dark"
          />
        </linearGradient>
        <radialGradient
          :id="capId"
          cx="0.35"
          cy="0.35"
          r="0.75"
        >
          <stop
            offset="0"
            class="dash-dial__cap-light"
          />
          <stop
            offset="1"
            class="dash-dial__cap-dark"
          />
        </radialGradient>
      </defs>

      <circle
        :cx="CX"
        :cy="CY"
        r="100"
        :fill="`url(#${bezelId})`"
      />
      <circle
        class="dash-dial__face"
        :cx="CX"
        :cy="CY"
        r="91"
      />
      <path
        class="dash-dial__track"
        :d="trackPath"
      />
      <path
        v-for="zone in zonePaths"
        :key="zone.key"
        class="dash-dial__zone"
        :data-tone="zone.tone"
        :d="zone.path"
      />
      <path
        v-if="valuePath"
        class="dash-dial__value"
        :d="valuePath"
      />
      <g class="dash-dial__ticks">
        <template
          v-for="tick in tickMarks"
          :key="tick.value"
        >
          <line
            :x1="tick.inner.x"
            :y1="tick.inner.y"
            :x2="tick.outer.x"
            :y2="tick.outer.y"
          />
          <text
            :x="tick.label.x"
            :y="tick.label.y"
            text-anchor="middle"
            dominant-baseline="middle"
          >{{ tick.text }}</text>
        </template>
      </g>
      <path
        v-if="markerPath"
        class="dash-dial__marker"
        :d="markerPath"
      />
      <g
        v-if="needleAngle !== null"
        class="dash-dial__needle"
        :style="{ transform: `rotate(${needleAngle}deg)` }"
      >
        <path :d="`M ${CX - 3.2} ${CY + 12} L ${CX} ${CY - 72} L ${CX + 3.2} ${CY + 12} Z`" />
      </g>
      <circle
        :cx="CX"
        :cy="CY"
        r="9"
        :fill="`url(#${capId})`"
        class="dash-dial__cap"
      />
      <rect
        class="dash-dial__lcd"
        :x="CX - 40"
        y="146"
        width="80"
        height="26"
        rx="7"
      />
      <text
        class="dash-dial__readout"
        :x="CX"
        y="160"
        text-anchor="middle"
        dominant-baseline="middle"
      >{{ readout }}</text>
    </svg>
    <figcaption class="dash-dial__caption">
      <span class="dash-dial__label">{{ label }}</span>
      <span
        v-if="caption"
        class="dash-dial__hint"
      >{{ caption }}</span>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import {
  DIAL_END_DEG,
  DIAL_START_DEG,
  arcPath,
  dialAngle,
  dialFraction,
  polarPoint,
  type DialScale,
} from '@/shared/lib/gauge-geometry';

export interface DialZone {
  from: number
  to: number
  tone: 'good' | 'warning' | 'critical'
}

const props = withDefaults(
  defineProps<{
    value: number | null
    min: number
    max: number
    label: string
    readout: string
    ticks: number[]
    formatTick: (value: number) => string
    scale?: DialScale
    zones?: DialZone[]
    /** A reference value (e.g. the window median) drawn as a notch on the rim. */
    marker?: number | null
    caption?: string
  }>(),
  { scale: 'linear', zones: () => [], marker: null, caption: '' }
);

const CX = 110;
const CY = 106;
const CENTER = { x: CX, y: CY };
const TRACK_RADIUS = 76;
const bezelId = `dial-bezel-${useId()}`;
const capId = `dial-cap-${useId()}`;

const range = computed(() => ({ min: props.min, max: props.max, scale: props.scale }));
const fraction = computed(() => dialFraction(props.value, range.value));
const needleAngle = computed(() => (fraction.value === null ? null : dialAngle(fraction.value)));
const trackPath = arcPath(CENTER, TRACK_RADIUS, [DIAL_START_DEG, DIAL_END_DEG]);
const valuePath = computed(() =>
  fraction.value === null || fraction.value === 0
    ? ''
    : arcPath(CENTER, TRACK_RADIUS, [DIAL_START_DEG, dialAngle(fraction.value)])
);

const zonePaths = computed(() =>
  props.zones.flatMap((zone, index) => {
    const from = dialFraction(zone.from, range.value);
    const to = dialFraction(zone.to, range.value);
    if (from === null || to === null || to <= from) return [];
    return [{ key: index, tone: zone.tone, path: arcPath(CENTER, 88, [dialAngle(from), dialAngle(to)]) }];
  })
);

const markerPath = computed(() => {
  const at = dialFraction(props.marker, range.value);
  if (at === null) return '';
  const angle = dialAngle(at);
  const outer = polarPoint(CENTER, 91, angle);
  const left = polarPoint(CENTER, 83, angle - 3.5);
  const right = polarPoint(CENTER, 83, angle + 3.5);
  return `M ${outer.x} ${outer.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
});

const tickMarks = computed(() =>
  props.ticks.flatMap((value) => {
    const at = dialFraction(value, range.value);
    if (at === null) return [];
    const angle = dialAngle(at);
    return [
      {
        value,
        inner: polarPoint(CENTER, 60, angle),
        outer: polarPoint(CENTER, 67, angle),
        label: polarPoint(CENTER, 48, angle),
        text: props.formatTick(value),
      },
    ];
  })
);

const ariaLabel = computed(() => [props.label, props.readout, props.caption].filter(Boolean).join(': '));
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.dash-dial {
  display: grid;
  justify-items: center;
  gap: size(0.5);
  margin: 0;
  min-width: 0;

  &__svg {
    width: 100%;
    max-width: 240px;
    height: auto;
    overflow: visible;
    filter: drop-shadow(6px 8px 10px color-mix(in srgb, theme-color('dash-bezel-dark') 55%, transparent));
  }

  &__bezel-light {
    stop-color: theme-color('dash-bezel-light');
  }

  &__bezel-dark {
    stop-color: theme-color('dash-bezel-dark');
  }

  &__cap-light {
    stop-color: theme-color('dash-bezel-light');
  }

  &__cap-dark {
    stop-color: color-mix(in srgb, theme-color('dash-bezel-dark') 80%, theme-color('content-primary'));
  }

  &__face {
    fill: theme-color('dash-well');
  }

  &__track {
    fill: none;
    stroke: theme-color('dash-grid');
    stroke-width: 10;
    stroke-linecap: round;
  }

  &__value {
    fill: none;
    stroke: theme-color('chart-accent');
    stroke-width: 10;
    stroke-linecap: round;
    transition: d 600ms ease;
  }

  &__zone {
    fill: none;
    stroke-width: 3;

    &[data-tone='good'] {
      stroke: theme-color('chart-good');
    }

    &[data-tone='warning'] {
      stroke: theme-color('chart-warning');
    }

    &[data-tone='critical'] {
      stroke: theme-color('chart-critical');
    }
  }

  &__ticks {
    line {
      stroke: theme-color('dash-ink-muted');
      stroke-width: 1.5;
      stroke-linecap: round;
    }

    text {
      fill: theme-color('dash-ink-muted');
      font-size: 10px;
      font-weight: 500;
      @include dash-tabular;
    }
  }

  &__marker {
    fill: theme-color('content-primary');
  }

  &__needle {
    transform-origin: 110px 106px;
    transition: transform 700ms cubic-bezier(0.34, 1.35, 0.64, 1);

    path {
      fill: theme-color('chart-accent');
      filter: drop-shadow(1px 2px 1.5px rgba(0, 0, 0, 0.35));
    }
  }

  &__lcd {
    fill: theme-color('dash-lcd');
    stroke: color-mix(in srgb, theme-color('dash-bezel-dark') 60%, transparent);
    stroke-width: 1;
  }

  &__readout {
    // A reading such as "425 ms" keeps its order inside right-to-left pages.
    direction: ltr;
    unicode-bidi: embed;
    fill: theme-color('dash-lcd-ink');
    font-size: 15px;
    font-weight: 700;
    @include dash-tabular;
  }

  &__caption {
    display: grid;
    justify-items: center;
    gap: 2px;
    text-align: center;
  }

  &__label {
    @include tpg-s4;
    font-weight: 600;
    color: theme-color('content-primary');
  }

  &__hint {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
    max-width: 26ch;
  }
}

html.dark .dash-dial__readout {
  filter: drop-shadow(0 0 4px color-mix(in srgb, theme-color('dash-lcd-ink') 70%, transparent));
}
</style>
