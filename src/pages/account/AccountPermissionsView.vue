<script setup lang="ts">
import { computed, watch } from 'vue';
import { SUCCESSFUL_FETCHING } from '@/shared/api/consts';
import * as http from '@/shared/api';
import { setupAsyncData } from '@/shared/utils/setup-async-data';
import BaseButton from '@/shared/ui/components/BaseButton.vue';
import BaseContentBlock from '@/shared/ui/components/BaseContentBlock.vue';
import BaseLoading from '@/shared/ui/components/BaseLoading.vue';
import BaseTable from '@/shared/ui/components/BaseTable.vue';
import { useCursorListRouteQuery } from '@/shared/ui/composables/useListRouteQuery';

const props = defineProps<{
  accountId: string
}>();

const { cursor, limit } = useCursorListRouteQuery({
  cursorKey: 'permissions_cursor',
  limitKey: 'permissions_limit',
});

const permissionsResource = setupAsyncData(() =>
  http.fetchAccountPermissions(props.accountId, {
    cursor: cursor.value,
    limit: limit.value,
  })
);

watch(
  [() => props.accountId, cursor, limit],
  () => {
    permissionsResource.refetch();
  }
);

const apiResult = computed(() => permissionsResource.data);
const permissionDenied = computed(() => apiResult.value?.status === 'permission-denied');
const response = computed(() =>
  apiResult.value?.status === SUCCESSFUL_FETCHING ? apiResult.value.data : null
);
const permissions = computed(() => response.value?.items ?? []);
</script>

<template>
  <BaseContentBlock
    title="Effective permissions"
    class="account-permissions"
  >
    <template #default>
      <div
        class="account-permissions__semantics row-text"
        data-test="permissions-provenance-notice"
      >
        <p>
          Torii returns the effective set: direct grants and permissions inherited from assigned roles are
          combined. The endpoint does not provide per-entry provenance, so this view does not label a grant as
          direct or role-inherited.
        </p>
        <p>
          This is an unsigned, caller-visible read. Dataspace-scoped grants outside this route's visibility can
          be omitted.
        </p>
      </div>

      <div
        v-if="permissionsResource.isLoading && !apiResult"
        class="account-permissions__state"
        role="status"
      >
        <BaseLoading />
        <span>Loading effective permissions…</span>
      </div>

      <div
        v-else-if="permissionDenied"
        class="account-permissions__state"
        role="alert"
        data-test="permissions-permission-denied"
      >
        <span>Torii denied access to this account's effective permissions.</span>
        <BaseButton
          bordered
          @click="permissionsResource.refetch"
        >
          Retry
        </BaseButton>
      </div>

      <div
        v-else-if="permissionsResource.notFound"
        class="account-permissions__state row-text"
        role="status"
      >
        No effective-permission record exists for this account.
      </div>

      <div
        v-else-if="permissionsResource.error"
        class="account-permissions__state"
        role="alert"
        data-test="permissions-error"
      >
        <span>Effective permissions could not be loaded: {{ permissionsResource.error.message }}</span>
        <BaseButton
          bordered
          @click="permissionsResource.refetch"
        >
          Retry
        </BaseButton>
      </div>

      <template v-else-if="response">
        <div
          v-if="permissions.length === 0"
          class="account-permissions__state row-text"
          role="status"
          data-test="permissions-empty"
        >
          This account has no effective permissions visible to this request.
        </div>

        <BaseTable
          v-else
          v-model:cursor="cursor"
          v-model:page-size="limit"
          pagination-mode="cursor"
          :loading="permissionsResource.isLoading"
          :cursor-pagination="response"
          :items="permissions"
          container-class="account-permissions__rows"
          :breakpoint="760"
        >
          <template #header>
            <div
              class="account-permissions__row account-permissions__row_header"
              role="presentation"
            >
              <span role="columnheader">Permission</span>
              <span role="columnheader">Exact payload</span>
            </div>
          </template>

          <template #row="{ item }">
            <div
              class="account-permissions__row"
              role="presentation"
            >
              <div role="cell">
                <strong>{{ item.name }}</strong>
              </div>
              <div role="cell">
                <pre>{{ JSON.stringify(item.payload, null, 2) }}</pre>
              </div>
            </div>
          </template>

          <template #mobile-card="{ item }">
            <div class="account-permissions__mobile-card">
              <strong>{{ item.name }}</strong>
              <pre>{{ JSON.stringify(item.payload, null, 2) }}</pre>
            </div>
          </template>
        </BaseTable>
      </template>
    </template>
  </BaseContentBlock>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.account-permissions {
  &__semantics,
  &__state {
    margin: size(2) size(4);
  }

  &__semantics {
    padding: size(2);
    border-inline-start: 3px solid theme-color('primary');
    background: theme-color('background-hover');

    p {
      margin: 0;

      & + p {
        margin-top: size(1);
      }
    }
  }

  &__state {
    min-height: size(12);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: size(2);
  }

  &__row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(12rem, 0.7fr) minmax(16rem, 1.3fr);
    gap: size(3);
    padding: size(2) size(4);
    align-items: start;

    &_header {
      @include tpg-s4;
    }
  }

  pre {
    min-width: 0;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: 'JetBrainsMono', monospace;
    font-size: size(1.5);
  }

  &__mobile-card {
    display: flex;
    flex-direction: column;
    gap: size(1);
    padding: size(2) size(4);
  }
}
</style>
