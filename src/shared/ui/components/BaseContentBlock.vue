<template>
  <div class="base-content-block">
    <div class="base-content-block__header">
      <slot name="header" />

      <template v-if="!slots.header">
        <h2 class="base-content-block__title">
          {{ props.title }}
        </h2>
        <slot name="header-action" />
      </template>
    </div>

    <hr>

    <div class="base-content-block__body">
      <slot name="default" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
}

const props = defineProps<Props>();
const slots = defineSlots();
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-content-block {
  position: relative;
  isolation: isolate;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, theme-color('surface') 98%, transparent),
    color-mix(in srgb, theme-color('surface-variant') 90%, transparent)
  );
  border: 1px solid color-mix(in srgb, theme-color('border-primary') 65%, transparent);
  border-radius: size(4);
  display: grid;
  grid-template-rows: auto auto 1fr;
  overflow: hidden;
  box-shadow:
    0 28px 60px color-mix(in srgb, theme-color('primary') 8%, transparent),
    0 6px 18px color-mix(in srgb, theme-color('background') 32%, transparent);
  transition:
    transform 240ms ease,
    box-shadow 240ms ease,
    border-color 240ms ease;
  animation: base-content-rise 320ms ease;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(circle at 20% 20%, color-mix(in srgb, theme-color('primary') 8%, transparent), transparent 35%),
      radial-gradient(circle at 80% 0%, color-mix(in srgb, theme-color('primary') 5%, transparent), transparent 30%);
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.8;
    animation: base-content-sheen 6s ease-in-out infinite;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: calc(size(4) - 1px);
    pointer-events: none;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (hover: hover) {
    &:hover {
      transform: translateY(-2px);
      box-shadow:
        0 32px 70px color-mix(in srgb, theme-color('primary') 10%, transparent),
        0 10px 22px color-mix(in srgb, theme-color('background') 36%, transparent);
      border-color: color-mix(in srgb, theme-color('primary') 35%, theme-color('border-primary'));
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 72px;
    padding: 0 size(4);
  }

  &__body {
    padding: 0 0 size(4) 0;
  }

  &__title {
    color: theme-color('content-primary');
    @include tpg-h3;

    @include sm {
      @include tpg-h2;
    }
  }
}

html:not(.dark) .base-content-block {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, theme-color('surface') 97%, white),
    color-mix(in srgb, theme-color('surface-variant') 94%, white)
  );
  border-color: color-mix(in srgb, theme-color('border-primary') 72%, white);
  box-shadow:
    theme-shadow('block-1'),
    theme-shadow('block-2'),
    theme-shadow('block-3');

  &::before {
    background:
      radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.94), transparent 30%),
      radial-gradient(circle at 28% 24%, color-mix(in srgb, theme-color('primary') 6%, transparent), transparent 42%),
      radial-gradient(circle at 84% 0%, color-mix(in srgb, theme-color('info') 4%, transparent), transparent 36%);
    opacity: 0.86;
    mix-blend-mode: normal;
    animation: none;
  }

  &::after {
    border-color: rgba(255, 255, 255, 0.58);
  }

  @media (hover: hover) {
    &:hover {
      transform: translateY(-1px);
      box-shadow:
        14px 16px 32px rgba(174, 154, 130, 0.18),
        -10px -10px 22px rgba(255, 255, 255, 0.88),
        inset 1px 1px 0 rgba(255, 255, 255, 0.98);
      border-color: color-mix(in srgb, theme-color('primary') 18%, theme-color('border-primary'));
    }
  }
}

@media (dynamic-range: high), (video-dynamic-range: high) {
  @supports (color: color(display-p3 1 1 1)) {
    html.dark .base-content-block {
      background: linear-gradient(
        165deg,
        color-mix(in display-p3, theme-color('surface') 99%, transparent),
        color-mix(in display-p3, theme-color('surface-variant') 92%, transparent)
      );
      border-color: color-mix(in display-p3, theme-color('primary') 30%, theme-color('border-primary'));
      box-shadow:
        0 34px 74px color-mix(in display-p3, theme-color('primary') 16%, transparent),
        0 12px 28px color-mix(in display-p3, theme-color('background') 42%, transparent);

      &::before {
        background: radial-gradient(
            circle at 20% 20%,
            color-mix(in display-p3, theme-color('primary') 24%, transparent),
            transparent 40%
          ),
          radial-gradient(
            circle at 80% 0%,
            color-mix(in display-p3, theme-color('primary') 16%, transparent),
            transparent 36%
          );
        opacity: 0.95;
      }

      @media (hover: hover) {
        &:hover {
          box-shadow:
            0 38px 84px color-mix(in display-p3, theme-color('primary') 20%, transparent),
            0 14px 30px color-mix(in display-p3, theme-color('background') 48%, transparent);
          border-color: color-mix(in display-p3, theme-color('primary') 45%, theme-color('border-primary'));
        }
      }
    }
  }
}

@keyframes base-content-rise {
  from {
    transform: translateY(6px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes base-content-sheen {
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.9;
  }
  100% {
    opacity: 0.7;
  }
}
</style>
