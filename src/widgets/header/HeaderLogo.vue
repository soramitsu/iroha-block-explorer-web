<template>
  <RouterLink
    to="/"
    class="header-logo"
  >
    <img
      :src="logoSrc"
      class="header-logo__img"
      alt="Hyperledger Iroha"
    >
  </RouterLink>
</template>

<script setup lang="ts">
import logoSrc from '/hyperledger_iroha_final.svg?url';
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
</style>
