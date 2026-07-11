<template>
  <label class="cv-field cv-trigger-mode-field">
    <span>触发模式</span>
    <Select
      v-model="message.triggerMode"
      :options="TRIGGER_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      class="cv-trigger-mode-select"
    />
  </label>

  <div v-if="message.triggerMode === 'keyword'" class="cv-field">
    <InputTags
      v-model="triggerKeywordsModel"
      :allow-duplicate="false"
      :pt="cosmosInputTagsPt"
      add-on-blur
      delimiter=","
      class="cv-trigger-inputchips"
    />
    <div class="cv-field-hint">输入关键词，回车或逗号添加</div>
    <span v-if="triggerKeywords.length === 0" class="cv-muted">关键词触发模式至少需要一个关键词</span>
  </div>
</template>

<script setup lang="ts">
import type { PromptLlmMessage, PromptLlmMessageTriggerMode } from '@/constants/novelai';
import { normalizePromptLlmMessageKeywords } from '@/services/prompt-llm/message-trigger';
import { cosmosInputTagsPt } from '@/services/primevue/primevue-pt';

const TRIGGER_MODE_OPTIONS: Array<{ label: string; value: PromptLlmMessageTriggerMode }> = [
  { label: '始终触发', value: 'always' },
  { label: '关键词触发', value: 'keyword' },
];

const message = defineModel<PromptLlmMessage>({ required: true });

const triggerKeywords = computed(() => message.value.triggerKeywords ?? []);

/**
 * 触发关键词双向绑定，写入时自动去重归一化
 */
const triggerKeywordsModel = computed({
  get: () => triggerKeywords.value,
  set: (value: string[]) => {
    message.value.triggerKeywords = normalizePromptLlmMessageKeywords(value);
  },
});
</script>

<style scoped>
@reference '../../global.css';

.cv-trigger-mode-field {
  @apply min-w-0;
}

.cv-trigger-keywords {
  @apply flex min-w-0 flex-col;
  grid-column: 1 / -1;
  gap: var(--cv-space-sm);
}

.cv-trigger-mode-select {
  @apply w-full;
}

.cv-trigger-inputchips {
  @apply w-full;
}

.cv-muted {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}
</style>
