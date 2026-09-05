<script setup lang="ts">
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';

const GOVERNANCE_ROUTE_PATTERN = '/v1/gov/*';
const GOVERNANCE_CAPABILITIES_ROUTE = '/v1/gov/capabilities';

defineOptions({
  name: 'GovernanceDashboardPage',
});
</script>

<template>
  <div class="governance-page">
    <BaseContentBlock :title="$t('governance.nav')">
      <template #default>
        <div class="governance-page__boundary" data-test="governance-auth-boundary">
          <span class="governance-page__eyebrow">{{ $t('governance.accessBoundary.eyebrow') }}</span>
          <h2>{{ $t('governance.accessBoundary.title') }}</h2>
          <i18n-t scope="global" keypath="governance.accessBoundary.protectedReads" tag="p">
            <template #governanceRoutes><code>{{ GOVERNANCE_ROUTE_PATTERN }}</code></template>
          </i18n-t>
          <i18n-t scope="global" keypath="governance.accessBoundary.capabilities" tag="p">
            <template #capabilitiesRoute><code>{{ GOVERNANCE_CAPABILITIES_ROUTE }}</code></template>
          </i18n-t>

          <dl class="governance-page__requirements">
            <div data-test="governance-signature-auth">
              <dt>{{ $t('governance.accessBoundary.singleSignatureTitle') }}</dt>
              <i18n-t scope="global" keypath="governance.accessBoundary.singleSignatureDescription" tag="dd">
                <template #accountHeader><code>X-Iroha-Account</code></template>
                <template #signatureHeader><code>X-Iroha-Signature</code></template>
                <template #timestampHeader><code>X-Iroha-Timestamp-Ms</code></template>
                <template #nonceHeader><code>X-Iroha-Nonce</code></template>
              </i18n-t>
            </div>
            <div data-test="governance-witness-auth">
              <dt>{{ $t('governance.accessBoundary.multisigWitnessTitle') }}</dt>
              <i18n-t scope="global" keypath="governance.accessBoundary.multisigWitnessDescription" tag="dd">
                <template #witnessHeader><code>X-Iroha-Witness</code></template>
                <template #accountHeader><code>X-Iroha-Account</code></template>
                <template #signatureHeader><code>X-Iroha-Signature</code></template>
                <template #timestampHeader><code>X-Iroha-Timestamp-Ms</code></template>
                <template #nonceHeader><code>X-Iroha-Nonce</code></template>
              </i18n-t>
            </div>
          </dl>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('governance.accessBoundary.contractTitle')">
      <template #default>
        <div class="governance-page__contract" data-test="governance-current-contract">
          <p>{{ $t('governance.accessBoundary.contractDescription') }}</p>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.governance-page {
  display: grid;
  gap: size(3);

  &__boundary,
  &__contract {
    display: grid;
    gap: size(1.5);
    padding: 0 size(2);
    color: theme-color('content-secondary');

    @include sm {
      padding: 0 size(3);
    }

    p,
    h2 {
      margin: 0;
    }

    h2 {
      color: theme-color('content-primary');
      @include tpg-h4;
    }

    code {
      color: theme-color('content-primary');
      overflow-wrap: anywhere;
    }
  }

  &__eyebrow {
    color: theme-color('content-tertiary');
    text-transform: uppercase;
    letter-spacing: 0.08em;
    @include tpg-s4;
  }

  &__requirements {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: size(1);
    margin: size(0.5) 0 0;

    div {
      display: grid;
      gap: size(0.5);
      border: 1px solid theme-color('border-primary');
      border-radius: size(1);
      padding: size(1.25);
      background: theme-color('surface-variant');
    }

    dt {
      color: theme-color('content-tertiary');
      @include tpg-s4;
    }

    dd {
      margin: 0;
    }
  }
}
</style>
