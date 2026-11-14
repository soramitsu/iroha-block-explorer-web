<template>
  <div class="base-page-layout">
    <slot />
  </div>
</template>
<style lang="scss">
.base-page-layout {
  width: 100%; max-width: 1680px; min-width: 0; margin: 0 auto;
  display: grid; align-content: start; gap: 24px; padding: 20px 12px 40px;
  @media (min-width: 640px) { padding: 24px; }
  > * { min-width: 0; }
}
</style>
