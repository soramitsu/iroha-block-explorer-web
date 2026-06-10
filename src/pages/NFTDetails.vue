<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed } from 'vue';
import * as http from '@/shared/api';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import DataField from '@/shared/ui/components/DataField.vue';
import { NftIdSchema } from '@/shared/api/schemas';
import { parseMetadata } from '@/shared/ui/utils/json';
import { useParamScope } from '@vue-kakuyaku/core';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import { useAdaptiveHash } from '@/shared/ui/composables/useAdaptiveHash';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';

const router = useRouter();

const hashType = useAdaptiveHash({ md: 'medium', sm: 'medium', xs: 'short', xxs: 'short' }, 'full');

const NFTId = computed(() => {
  const id = router.currentRoute.value.params['id'];

  return NftIdSchema.parse(id);
});

const NFTScope = useParamScope(
  () => {
    return {
      key: NFTId.value.toString(),
      payload: NFTId.value,
    };
  },
  ({ payload }) => setupAsyncData(() => http.fetchNFTById(payload))
);

const isLoading = computed(() => NFTScope.value.expose.isLoading);
const NFT = computed(() =>
  NFTScope.value?.expose.data?.status === SUCCESSFUL_FETCHING ? NFTScope.value.expose.data.data : undefined
);
const nftDisplayName = computed(() => NFTId.value.split('$')[0] ?? NFTId.value);
</script>

<template>
  <div class="nft-details">
    <BaseContentBlock
      :title="nftDisplayName"
      class="nft-details__section"
    >
      <template #default>
        <div
          v-if="isLoading"
          class="nft-details__section_loading"
        >
          <BaseLoading />
        </div>
        <div v-else-if="NFT">
          <div class="nft-details__section-information">
            <DataField
              :title="$t('assets.ownedBy')"
              :hash="NFT.owned_by.toString()"
              copy
              :link="`/accounts/${NFT.owned_by}`"
              :type="hashType"
            />
            <DataField
              class="nft-details__section-information-nft-content"
              :title="$t('content')"
              :metadata="{ display: 'full' }"
              :value="parseMetadata(NFT.metadata)"
            />
          </div>
        </div>
      </template>
    </BaseContentBlock>
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.nft-details {
  display: flex;
  flex-direction: column;

  @include xxs {
    padding: 0 size(2);
    gap: size(2);
  }

  @include md {
    padding: 0 size(3);
  }

  &__section {
    &_loading {
      margin-top: size(1);
      display: flex;
      justify-content: center;
    }

    &-information {
      display: flex;
      flex-direction: column;
      margin-top: size(2);
      padding: 0 size(2) 0 size(4);
      gap: size(2);
      overflow: auto;

      &-nft-content {
        @include xxs {
          width: 75vw;
        }
        @include sm {
          width: auto;
        }
      }
    }
  }
}
</style>
