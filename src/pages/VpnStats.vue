<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import * as http from '@/shared/api';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseResourceState from '@/shared/ui/components/BaseResourceState.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { formatTimestamp } from '@/shared/ui/utils/formatters';
import { setupAsyncData } from '@/shared/utils/setup-async-data';

defineOptions({
  name: 'VpnStatsPage',
});

const { t } = useI18n();
const profileResource = setupAsyncData(() => http.fetchVpnProfile());
const profile = computed(() => {
  const result = profileResource.data;
  return result?.status === SUCCESSFUL_FETCHING ? result.data : null;
});
const availabilityLabel = computed(() =>
  profile.value?.available ? t('vpn.statusLabels.active') : t('vpn.statusLabels.disabled')
);
const leaseDuration = computed(() =>
  profile.value ? formatTimestamp(profile.value.lease_secs * 1_000) : null
);
const dnsPushInterval = computed(() =>
  profile.value ? formatTimestamp(profile.value.dns_push_interval_secs * 1_000) : null
);
const settlementGrace = computed(() =>
  profile.value ? formatTimestamp(profile.value.settlement_grace_secs * 1_000) : null
);
const paddingBudget = computed(() =>
  profile.value ? formatTimestamp(profile.value.padding_budget_ms) : null
);
const supportedExitClasses = computed(() => profile.value?.supported_exit_classes.join(' · ') || t('none'));
const pushedRoutes = computed(() => profile.value?.route_pushes.join(' · ') || t('none'));
const excludedRoutes = computed(() => profile.value?.excluded_routes.join(' · ') || t('none'));
const dnsServers = computed(() => profile.value?.dns_servers.join(' · ') || t('none'));
const tunnelAddresses = computed(() => profile.value?.tunnel_addresses.join(' · ') || t('none'));
</script>

<template>
  <div class="vpn-stats-page">
    <BaseContentBlock :title="$t('vpn.profile.title')">
      <template #default>
        <BaseResourceState
          :snapshot="profileResource.snapshot"
          :error-label="$t('vpn.profile.loadError')"
          @retry="profileResource.refetch()"
        >
          <div v-if="profile" class="vpn-stats-page__profile" data-test="vpn-public-profile">
            <p class="vpn-stats-page__description">
              {{ $t('vpn.profile.description') }}
            </p>

            <p
              v-if="!profile.available"
              class="vpn-stats-page__unavailable row-text"
              data-test="vpn-profile-unavailable"
              role="status"
            >
              {{ $t('vpn.profile.unavailable') }}
            </p>

            <div class="vpn-stats-page__profile-grid">
              <DataField
                data-test="vpn-profile-availability"
                :title="$t('vpn.profile.fields.availability')"
                :value="availabilityLabel"
              />
              <DataField
                data-test="vpn-profile-relay"
                :title="$t('vpn.profile.fields.relayEndpoint')"
                :value="profile.relay_endpoint || $t('none')"
                monospace
              />
              <DataField
                data-test="vpn-profile-exit-classes"
                :title="$t('vpn.profile.fields.exitClasses')"
                :value="supportedExitClasses"
              />
              <DataField
                data-test="vpn-profile-default-exit-class"
                :title="$t('vpn.profile.fields.defaultExitClass')"
                :value="profile.default_exit_class"
              />
              <DataField
                data-test="vpn-profile-lease"
                :title="$t('vpn.profile.fields.leaseDuration')"
                :value="leaseDuration"
                monospace
              />
              <DataField
                data-test="vpn-profile-dns-push-interval"
                :title="$t('vpn.profile.fields.dnsPushInterval')"
                :value="dnsPushInterval"
                monospace
              />
              <DataField
                data-test="vpn-profile-billing"
                :title="$t('vpn.profile.fields.billing')"
                :value="profile.display_billing_label"
              />
              <DataField
                data-test="vpn-profile-meter-family"
                :title="$t('vpn.profile.fields.meterFamily')"
                :value="profile.meter_family"
                monospace
              />
              <DataField
                data-test="vpn-profile-lease-fee"
                :title="$t('vpn.profile.fields.leaseFee')"
                :value="profile.lease_fee.toString()"
                monospace
              />
              <DataField
                data-test="vpn-profile-settlement-grace"
                :title="$t('vpn.profile.fields.settlementGrace')"
                :value="settlementGrace"
                monospace
              />
              <DataField
                data-test="vpn-profile-operator"
                :title="$t('vpn.profile.fields.operatorAccount')"
                :value="profile.operator_account_id"
                :link="`/accounts/${encodeURIComponent(profile.operator_account_id)}`"
                monospace
              />
              <DataField
                data-test="vpn-profile-pushed-routes"
                :title="$t('vpn.profile.fields.routePushes')"
                :value="pushedRoutes"
                monospace
              />
              <DataField
                data-test="vpn-profile-excluded-routes"
                :title="$t('vpn.profile.fields.excludedRoutes')"
                :value="excludedRoutes"
                monospace
              />
              <DataField
                data-test="vpn-profile-dns-servers"
                :title="$t('vpn.profile.fields.dnsServers')"
                :value="dnsServers"
                monospace
              />
              <DataField
                data-test="vpn-profile-tunnel-addresses"
                :title="$t('vpn.profile.fields.tunnelAddresses')"
                :value="tunnelAddresses"
                monospace
              />
              <DataField
                data-test="vpn-profile-mtu"
                :title="$t('vpn.profile.fields.mtuBytes')"
                :value="`${profile.mtu_bytes} B`"
                monospace
              />
              <DataField
                data-test="vpn-profile-flow-label-bits"
                :title="$t('vpn.profile.fields.flowLabelBits')"
                :value="profile.flow_label_bits"
                monospace
              />
              <DataField
                data-test="vpn-profile-padding-budget"
                :title="$t('vpn.profile.fields.paddingBudget')"
                :value="paddingBudget"
                monospace
              />
              <DataField
                data-test="vpn-profile-relay-id"
                :title="$t('vpn.profile.fields.relayId')"
                :value="profile.relay_id_hex || $t('none')"
                :hash="profile.relay_id_hex"
                type="short"
                copy
                monospace
              />
              <DataField
                data-test="vpn-profile-relay-mldsa65"
                :title="$t('vpn.profile.fields.relayMldsa65PublicKey')"
                :value="profile.relay_mldsa65_public_key_hex || $t('none')"
                :hash="profile.relay_mldsa65_public_key_hex"
                type="short"
                copy
                monospace
              />
              <DataField
                data-test="vpn-profile-descriptor-commit"
                :title="$t('vpn.profile.fields.descriptorCommit')"
                :value="profile.descriptor_commit_hex || $t('none')"
                :hash="profile.descriptor_commit_hex"
                type="short"
                copy
                monospace
              />
              <DataField
                data-test="vpn-profile-tls"
                :title="$t('vpn.profile.fields.tlsServerName')"
                :value="profile.tls_server_name || $t('none')"
                monospace
              />
              <DataField
                data-test="vpn-profile-tls-spki"
                :title="$t('vpn.profile.fields.tlsSpkiDigest')"
                :value="profile.relay_tls_spki_sha256_hex || $t('none')"
                :hash="profile.relay_tls_spki_sha256_hex"
                type="short"
                copy
                monospace
              />
              <DataField
                data-test="vpn-profile-certificate"
                :title="$t('vpn.profile.fields.relayCertificateDigest')"
                :value="profile.relay_certificate_sha256_hex || $t('none')"
                :hash="profile.relay_certificate_sha256_hex"
                type="short"
                copy
                monospace
              />
              <DataField
                data-test="vpn-profile-directory"
                :title="$t('vpn.profile.fields.directorySnapshot')"
                :value="profile.directory_snapshot_digest_hex || $t('none')"
                :hash="profile.directory_snapshot_digest_hex"
                type="short"
                copy
                monospace
              />
            </div>
          </div>
        </BaseResourceState>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('vpn.overviewTitle')">
      <template #default>
        <div class="vpn-stats-page__boundary" data-test="vpn-diagnostic-boundary">
          <span class="vpn-stats-page__eyebrow">{{ $t('vpn.accessBoundary.eyebrow') }}</span>
          <h2>{{ $t('vpn.accessBoundary.title') }}</h2>
          <i18n-t scope="global" keypath="vpn.accessBoundary.metricsDescription" tag="p">
            <template #metrics><code>/metrics</code></template>
          </i18n-t>
          <p>{{ $t('vpn.accessBoundary.browserDescription') }}</p>
        </div>
      </template>
    </BaseContentBlock>

    <BaseContentBlock :title="$t('vpn.accessBoundary.contractTitle')">
      <template #default>
        <dl class="vpn-stats-page__requirements" data-test="vpn-auth-contract">
          <div>
            <dt>{{ $t('vpn.accessBoundary.endpointLabel') }}</dt>
            <dd><code>/metrics</code></dd>
          </div>
          <div>
            <dt>{{ $t('vpn.accessBoundary.toriiAdmissionLabel') }}</dt>
            <dd>{{ $t('vpn.accessBoundary.toriiAdmissionValue') }}</dd>
          </div>
          <div>
            <dt>{{ $t('vpn.accessBoundary.deploymentPolicyLabel') }}</dt>
            <dd>{{ $t('vpn.accessBoundary.deploymentPolicyValue') }}</dd>
          </div>
          <div>
            <dt>{{ $t('vpn.accessBoundary.explorerBehaviorLabel') }}</dt>
            <dd>{{ $t('vpn.accessBoundary.explorerBehaviorValue') }}</dd>
          </div>
        </dl>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.vpn-stats-page {
  display: grid;
  gap: size(3);

  &__profile {
    display: grid;
    gap: size(2);
    padding: 0 size(2);

    @include sm {
      padding: 0 size(3);
    }
  }

  &__description,
  &__unavailable {
    margin: 0;
  }

  &__description {
    color: theme-color('content-secondary');
  }

  &__unavailable {
    border-inline-start: 3px solid theme-color('border-primary');
    padding: size(1) size(1.5);
    color: theme-color('content-secondary');
    background: theme-color('surface-variant');
  }

  &__profile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: size(2);
  }

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
