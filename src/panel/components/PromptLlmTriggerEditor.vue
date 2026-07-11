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

  <div v-if="message.triggerMode === 'keyword'" class="cv-field cv-trigger-keywords-field">
    <span>触发词</span>
    <div class="cv-field-control">
      <InputTags
        v-model="triggerKeywordsModel"
        :allow-duplicate="false"
        add-on-blur
        delimiter=","
        class="cv-trigger-inputchips"
      />
      <div class="cv-field-hint">输入关键词，回车或逗号添加</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PromptLlmMessage, PromptLlmMessageTriggerMode } from '@/constants/novelai';
import { normalizePromptLlmMessageKeywords } from '@/services/prompt-llm/message-trigger';

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

.cv-trigger-mode-select {
  @apply w-full;
}

.cv-trigger-keywords-field {
  @apply min-w-0 w-full;
}

.cv-trigger-inputchips {
  @apply w-full;
}
</style>
