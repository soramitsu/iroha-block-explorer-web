<template>
  <figure
    class="chart-frame"
    :aria-labelledby="titleId"
    :aria-busy="busy || undefined"
  >
    <figcaption class="chart-frame__head">
      <div class="chart-frame__titles">
        <h3
          :id="titleId"
          class="chart-frame__title"
        >
          {{ title }}
        </h3>
        <p
          v-if="caption"
          class="chart-frame__caption"
        >
          {{ caption }}
        </p>
      </div>
      <button
        v-if="table"
        type="button"
        class="chart-frame__toggle"
        :aria-pressed="showTable"
        data-test="chart-table-toggle"
        @click="showTable = !showTable"
      >
        {{ showTable ? $t('dashboards.chart.showChart') : $t('dashboards.chart.showTable') }}
      </button>
    </figcaption>

    <ul
      v-if="legend.length > 0"
      class="chart-frame__legend"
    >
      <li
        v-for="item in legend"
        :key="item.key"
        class="chart-frame__legend-item"
      >
        <span
          class="chart-frame__swatch"
          :data-shape="item.shape ?? 'rect'"
          :style="{ color: item.color }"
          aria-hidden="true"
        />
        {{ item.label }}
      </li>
    </ul>

    <div
      v-show="!showTable"
      ref="well"
      class="chart-frame__well"
      :data-busy="busy || null"
    >
      <p
        v-if="empty"
        class="chart-frame__empty"
      >
        {{ empty }}
      </p>
      <slot
        v-else-if="width > 0"
        :width
      />
    </div>

    <div
      v-if="showTable && table"
      class="chart-frame__table"
    >
      <table>
        <caption class="chart-frame__sr">
          {{ title }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in table.columns"
              :key="column.key"
              scope="col"
              :data-align="column.align ?? 'start'"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in table.rows"
            :key="index"
          >
            <td
              v-for="column in table.columns"
              :key="column.key"
              :data-align="column.align ?? 'start'"
            >
              <bdi>{{ row[column.key] }}</bdi>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="table.footnote"
        class="chart-frame__footnote"
      >
        {{ table.footnote }}
      </p>
    </div>

    <p
      v-if="note"
      class="chart-frame__note"
    >
      {{ note }}
    </p>
  </figure>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import type { ChartLegendItem, ChartTable } from './types';

withDefaults(
  defineProps<{
    title: string
    caption?: string
    legend?: ChartLegendItem[]
    table?: ChartTable | null
    /** Shown instead of the plot when there is nothing honest to draw. */
    empty?: string
    note?: string
    /** Refetching: the previous render stays visible at reduced opacity. */
    busy?: boolean
  }>(),
  { caption: '', legend: () => [], table: null, empty: '', note: '', busy: false }
);

const titleId = useId();
const showTable = ref(false);
const well = ref<HTMLElement | null>(null);
const { width: measured } = useElementSize(well);
const width = ref(0);

// Whole pixels keep SVG geometry stable while a container animates.
watch(
  measured,
  (value) => {
    width.value = Math.floor(value);
  },
  { immediate: true }
);
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.chart-frame {
  display: grid;
  gap: size(1.25);
  margin: 0;
  min-width: 0;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: size(1.5);
  }

  &__titles {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    @include tpg-s3;
    font-weight: 600;
    color: theme-color('content-primary');
  }

  &__caption {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
    max-width: 70ch;
  }

  &__toggle {
    @include dash-key-surface(size(1.25));
    flex: 0 0 auto;
    border: none;
    padding: size(0.5) size(1.25);
    cursor: pointer;
    @include tpg-s5-bold;
    color: theme-color('content-secondary');

    &[aria-pressed='true'] {
      background: theme-color('dash-well');
      box-shadow: theme-shadow('dash-inset');
      color: theme-color('content-primary');
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, theme-color('chart-accent') 60%, transparent);
      outline-offset: 2px;
    }
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: size(0.75) size(2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__legend-item {
    display: inline-flex;
    align-items: center;
    gap: size(0.75);
    @include tpg-s5;
    color: theme-color('content-secondary');
  }

  &__swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: currentColor;

    &[data-shape='line'] {
      width: 14px;
      height: 2px;
      border-radius: 1px;
    }

    &[data-shape='hatch'] {
      background: repeating-linear-gradient(45deg, currentColor 0 1.5px, transparent 1.5px 4px);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent);
    }

    &[data-shape='hollow'] {
      border: 2px solid currentColor;
      border-radius: 50%;
      background: transparent;
    }
  }

  &__well {
    @include dash-well-surface(size(2));
    position: relative;
    min-width: 0;
    min-height: 120px;
    padding: size(1.5) size(1.5) size(1);
    transition: opacity 200ms ease;

    &[data-busy] {
      opacity: 0.55;
    }
  }

  &__footnote {
    margin: size(1) 0 0;
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }

  &__empty {
    display: grid;
    place-items: center;
    min-height: 120px;
    text-align: center;
    @include tpg-s4;
    color: theme-color('dash-ink-muted');
  }

  &__table {
    @include dash-well-surface(size(2));
    max-height: 320px;
    overflow: auto;
    padding: size(1);

    table {
      width: 100%;
      border-collapse: collapse;
      @include tpg-s4;
      @include dash-tabular;
    }

    th,
    td {
      padding: 6px 10px;
      text-align: start;
      border-bottom: 1px solid theme-color('dash-grid');
      color: theme-color('content-primary');
      white-space: nowrap;

      &[data-align='end'] {
        text-align: end;
      }
    }

    th {
      position: sticky;
      top: 0;
      background: theme-color('dash-well');
      color: theme-color('content-secondary');
      font-weight: 600;
    }
  }

  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  &__note {
    @include tpg-s5;
    color: theme-color('dash-ink-muted');
  }
}
</style>
