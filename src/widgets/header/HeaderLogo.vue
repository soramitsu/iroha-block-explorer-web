<template>
  <BaseLink
    to="/"
    class="header-logo"
    aria-label="Hyperledger Iroha"
  >
    <Logo
      class="header-logo__img"
      aria-hidden="true"
      focusable="false"
    />
  </BaseLink>
</template>

<script setup lang="ts">
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import Logo from '@/assets/hyperledger_iroha_final.svg';
</script>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.header-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &__img {
    width: 140px;
    height: auto;

    @include xs {
      width: 160px;
    }

    @include xl {
      width: 200px;
    }
  }
}
html.dark .header-logo__img .st4 { fill: #e9e9e9; }
</style>
