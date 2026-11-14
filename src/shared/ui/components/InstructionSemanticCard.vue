<script setup lang="ts">
import BaseLink from '@/shared/ui/components/BaseLink.vue';
import { useI18n } from 'vue-i18n';
import type {
  InstructionPresentation,
  InstructionPresentationField,
  InstructionPresentationMessage,
} from '@/shared/lib/instruction-presentation';

const { t } = useI18n();

defineProps<{
  presentation: InstructionPresentation
  compact?: boolean
}>();

function fieldTestId(field: InstructionPresentationField): string {
  return `instruction-semantic-field-${field.key}`;
}

function localize(message: InstructionPresentationMessage): string {
  return t(message.key, message.params ?? {});
}
</script>

<template>
  <article
    class="instruction-semantic-card"
    :class="{ 'instruction-semantic-card_compact': compact }"
    data-test="instruction-semantic-card"
  >
    <header class="instruction-semantic-card__header">
      <div>
        <div class="instruction-semantic-card__eyebrow">
          {{ presentation.family }} · {{ presentation.variant }}
        </div>
        <h4>{{ localize(presentation.title) }}</h4>
      </div>
      <span class="instruction-semantic-card__request">{{ $t('studio.instructionPresentation.card.request') }}</span>
    </header>

    <dl
      v-if="presentation.fields.length"
      class="instruction-semantic-card__fields"
    >
      <div
        v-for="item in presentation.fields"
        :key="item.key"
        class="instruction-semantic-card__field"
        :data-test="fieldTestId(item)"
      >
        <dt>{{ localize(item.label) }}</dt>
        <dd>
          <BaseLink
            v-if="item.link"
            :to="item.link"
            monospace
          >
            {{ item.value }}
          </BaseLink>
          <span v-else>{{ item.value }}</span>
        </dd>
      </div>
    </dl>

    <section
      v-if="presentation.nestedInstructions.length"
      class="instruction-semantic-card__nested"
      data-test="instruction-semantic-nested"
    >
      <h5>{{ $t('studio.instructionPresentation.card.proposedInstructions') }}</h5>
      <article
        v-for="instruction in presentation.nestedInstructions"
        :key="instruction.index"
        class="instruction-semantic-card__nested-item"
        :data-test="`instruction-semantic-nested-${instruction.index}`"
      >
        <template v-if="instruction.presentation">
          <div class="instruction-semantic-card__nested-heading">
            <span>#{{ instruction.index }}</span>
            <strong>{{ localize(instruction.presentation.title) }}</strong>
            <span>{{ instruction.presentation.family }} · {{ instruction.presentation.variant }}</span>
          </div>
          <dl class="instruction-semantic-card__nested-fields">
            <div
              v-for="item in instruction.presentation.fields"
              :key="item.key"
              class="instruction-semantic-card__field"
            >
              <dt>{{ localize(item.label) }}</dt>
              <dd>
                <BaseLink
                  v-if="item.link"
                  :to="item.link"
                  monospace
                >
                  {{ item.value }}
                </BaseLink>
                <span v-else>{{ item.value }}</span>
              </dd>
            </div>
          </dl>
        </template>
        <template v-else>
          <div class="instruction-semantic-card__nested-heading">
            <span>#{{ instruction.index }}</span>
            <strong>{{ $t('studio.instructionPresentation.card.encodedInstruction') }}</strong>
          </div>
          <pre>{{ instruction.encoded }}</pre>
        </template>
      </article>
    </section>
  </article>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.instruction-semantic-card {
  min-width: 0;
  width: 100%;
  padding: size(2.5);
  border: 1px solid color-mix(in srgb, theme-color('primary') 28%, theme-color('border-primary'));
  border-radius: size(1.5);
  background: theme-color('surface');
  color: theme-color('content-primary');

  &_compact {
    padding: size(2);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: size(2);

    h4 {
      margin: size(0.5) 0 0;
      font-size: size(2.25);
      line-height: 1.3;
    }
  }

  &__eyebrow,
  &__request {
    color: theme-color('content-tertiary');
    @include tpg-s3;
  }

  &__request {
    flex: 0 0 auto;
    padding: size(0.5) size(1);
    border: 1px solid theme-color('border-primary');
    border-radius: size(2);
  }

  &__fields,
  &__nested-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: size(1.5) size(3);
    margin: size(2) 0 0;
  }

  &__field {
    min-width: 0;

    dt {
      margin-bottom: size(0.5);
      color: theme-color('content-tertiary');
      @include tpg-s3;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
      font-family: 'JetBrainsMono', monospace;
      font-size: size(1.75);
    }
  }

  &__nested {
    margin-top: size(2.5);
    padding-top: size(2);
    border-top: 1px solid theme-color('border-primary');

    h5 {
      margin: 0 0 size(1.5);
      font-size: size(1.75);
    }
  }

  &__nested-item {
    padding: size(1.5);
    border: 1px solid theme-color('border-primary');
    border-radius: size(1);
    background: color-mix(in srgb, theme-color('surface') 72%, transparent);

    & + & {
      margin-top: size(1);
    }

    pre {
      margin: size(1) 0 0;
      max-height: size(16);
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: 'JetBrainsMono', monospace;
      font-size: size(1.5);
    }
  }

  &__nested-heading {
    display: flex;
    flex-wrap: wrap;
    gap: size(1);
    align-items: baseline;

    > span {
      color: theme-color('content-tertiary');
      @include tpg-s3;
    }
  }

  &__nested-fields {
    margin-top: size(1.5);
  }
}
</style>
