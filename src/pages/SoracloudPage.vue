<script setup lang="ts">
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';

defineOptions({
  name: 'SoracloudPage',
});

const publicDiscoveryRoutes = [
  '/v1/soracloud/services/{service_name}/public-discovery',
  '/v1/soracloud/services/{service_name}/revisions/{service_version}/public-discovery',
] as const;

const authenticatedReadRoutes = [
  '/v1/soracloud/status',
  '/v1/soracloud/apps/status',
  '/v1/soracloud/apps/{app_name}/status',
  '/v1/soracloud/service/config/status',
  '/v1/soracloud/service/secret/status',
  '/v1/soracloud/health/compliance/report',
  '/v1/soracloud/training/job/status',
  '/v1/soracloud/model/weight/status',
  '/v1/soracloud/model/artifact/status',
  '/v1/soracloud/model/upload/status',
  '/v1/soracloud/hf/lease/status',
  '/v1/soracloud/agent/status',
  '/v1/soracloud/agent/mailbox/status',
  '/v1/soracloud/agent/autonomy/status',
] as const;
</script>

<template>
  <div class="soracloud-page">
    <BaseContentBlock :title="$t('soracloud.title')">
      <template #default>
        <div class="soracloud-page__boundary" data-test="soracloud-auth-boundary">
          <span class="soracloud-page__eyebrow">{{ $t('soracloud.accessBoundary.eyebrow') }}</span>
          <h2>{{ $t('soracloud.accessBoundary.title') }}</h2>
          <p>{{ $t('soracloud.accessBoundary.discoveryDescription') }}</p>
          <i18n-t scope="global" keypath="soracloud.accessBoundary.protectedDescription" tag="p">
            <template #networkId><code>NetworkId</code></template>
          </i18n-t>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('soracloud.accessBoundary.contractTitle')">
      <template #default>
        <h3>{{ $t('soracloud.accessBoundary.publicDiscoveryTitle') }}</h3>
        <ul class="soracloud-page__routes" data-test="soracloud-public-routes">
          <li v-for="route in publicDiscoveryRoutes" :key="route">
            <code>{{ route }}</code>
          </li>
        </ul>
        <h3>{{ $t('soracloud.accessBoundary.authenticatedReadsTitle') }}</h3>
        <ul class="soracloud-page__routes" data-test="soracloud-authenticated-routes">
          <li v-for="route in authenticatedReadRoutes" :key="route">
            <code>{{ route }}</code>
          </li>
        </ul>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.soracloud-page {
  display: grid;
  gap: size(3);

  &__boundary,
  &__routes {
    margin: 0;
    padding-inline: size(2);

    @include sm {
      padding-inline: size(3);
    }
  }

  &__boundary {
    display: grid;
    gap: size(1.25);
    color: theme-color('content-secondary');

    h2,
    p {
      margin: 0;
    }

    h2,
    code {
      color: theme-color('content-primary');
    }
  }

  &__eyebrow {
    color: theme-color('content-tertiary');
    text-transform: uppercase;
    letter-spacing: 0.04em;
    @include tpg-s3;
  }

  &__routes {
    display: grid;
    gap: size(1);
    list-style: none;
  }

  h3 {
    margin: size(2) size(2) size(1);

    @include sm {
      margin-inline: size(3);
    }
  }
}
</style>
