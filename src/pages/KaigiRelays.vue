<script setup lang="ts">
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';

defineOptions({
  name: 'KaigiRelaysPage',
});
</script>

<template>
  <div class="kaigi-relays-page">
    <BaseContentBlock :title="$t('kaigi.overview')">
      <template #default>
        <div
          class="kaigi-relays-page__boundary"
          data-test="kaigi-operator-boundary"
        >
          <span class="kaigi-relays-page__eyebrow">{{ $t('kaigi.accessBoundary.eyebrow') }}</span>
          <h2>{{ $t('kaigi.accessBoundary.title') }}</h2>
          <p>
            {{
              $t('kaigi.accessBoundary.snapshotDescription', {
                operatorSigningContext: 'OperatorSigningContext',
              })
            }}
          </p>
          <p>
            {{ $t('kaigi.accessBoundary.streamDescription') }}
          </p>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('kaigi.accessBoundary.contractTitle')">
      <template #default>
        <dl
          class="kaigi-relays-page__requirements"
          data-test="kaigi-auth-contract"
        >
          <div>
            <dt>{{ $t('kaigi.accessBoundary.snapshotContext') }}</dt>
            <dd>{{ $t('kaigi.accessBoundary.snapshotContextValue') }}</dd>
          </div>
          <div>
            <dt>{{ $t('kaigi.accessBoundary.snapshotCredential') }}</dt>
            <dd>{{ $t('kaigi.accessBoundary.snapshotCredentialValue') }}</dd>
          </div>
          <div>
            <dt>{{ $t('kaigi.accessBoundary.eventStream') }}</dt>
            <dd>{{ $t('kaigi.accessBoundary.eventStreamValue') }}</dd>
          </div>
          <div>
            <dt>{{ $t('kaigi.accessBoundary.failureMode') }}</dt>
            <dd>{{ $t('kaigi.accessBoundary.failureModeValue') }}</dd>
          </div>
        </dl>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.kaigi-relays-page {
  display: grid;
  gap: size(3);

  &__boundary {
    display: grid;
    gap: size(1.5);
    padding: 0 size(2);
    color: theme-color('content-secondary');

    @include sm {
      padding: 0 size(3);
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      color: theme-color('content-primary');
      @include tpg-h4;
    }

    code {
      color: theme-color('content-primary');
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
    margin: 0;
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }

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
      color: theme-color('content-primary');
    }
  }
}
</style>
