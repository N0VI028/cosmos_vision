<template>
  <div v-if="enabledMessages.length === 0" class="cv-preview-empty">暂无已启用条目</div>
  <div v-else class="cv-preview-list custom-scrollbar">
    <section v-for="message in enabledMessages" :key="message.id" class="cv-preview-block">
      <div class="cv-preview-body">
        <span v-if="isReservedMessage(message)" class="cv-preview-token">
          <span>{{ getReservedPreviewText(message) }}</span>
        </span>
        <pre v-else class="cv-preview-text">{{ message.content }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { PromptLlmMessage } from '@/constants/novelai';
import { getPromptLlmReservedPreviewText, isPromptLlmReservedMessage } from '@/services/prompt-llm/message-preset';

const props = defineProps<{ messages: PromptLlmMessage[] }>();

const enabledMessages = computed(() => props.messages.filter(message => message.enabled !== false));

/**
 * 判断消息是否为保留消息
 * @param message 消息条目
 * @returns 是否为保留消息
 */
function isReservedMessage(message: PromptLlmMessage): boolean {
  return isPromptLlmReservedMessage(message);
}

/**
 * 获取保留条目预览文本
 * @param message 消息条目
 * @returns 预览文本
 */
function getReservedPreviewText(message: PromptLlmMessage): string {
  return getPromptLlmReservedPreviewText(message);
}
</script>

<style scoped>
.cv-preview-list {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-4xl);
  height: 16rem;
  min-height: 6rem;
  overflow-y: auto;
  resize: vertical;
  padding: var(--cv-space-5xl);
  background: var(--p-content-background);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius);
  margin: 0 0 var(--cv-space-5xl) 0;
}

.cv-preview-body {
  display: flex;
  align-items: flex-start;
  min-height: 1.5rem;
}

.cv-preview-token {
  display: inline-flex;
  align-items: center;
  gap: var(--cv-space-sm);
  min-height: 2rem;
  padding: 0 var(--cv-space-lg);
  border: var(--cv-border-width) solid color-mix(in srgb, var(--p-primary-color) 60%, var(--p-content-border-color));
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  color: var(--p-primary-color);
  user-select: none;
}

.cv-preview-text {
  margin: 0;
  width: 100%;
  min-height: 1.5rem;
  font-size: calc(var(--mainFontSize) * 0.9);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--cv-on-surface);
}

.cv-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 16rem;
  padding: var(--cv-space-9xl);
  color: var(--p-text-muted-color);
  text-align: center;
  background: var(--p-content-background);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius);
  margin: 0 0 var(--cv-space-5xl) 0;
}
</style>
