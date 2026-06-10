<template>
  <div class="base-page-layout">
    <slot />
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.base-page-layout {
  padding: size(1) size(1) size(3) size(1);
  min-height: calc(100vh - $header-height-mobile);
  display: grid;
  gap: size(2.5);
  margin: 0 auto;
  max-width: 1180px;
  width: 100%;

  @include xs {
    padding: size(1) size(2) size(4) size(2);
    min-height: calc(100vh - $header-height-landscape-mobile);
  }

  @include md {
    padding: size(1.5) size(3) size(5) size(3);
    min-height: calc(100vh - $header-height);
  }

  @include xl {
    max-width: $xl;
  }

  @include xxl {
    padding: size(1.5) size(7) size(7) size(7);
    max-width: $xxl;
  }
}
</style>
