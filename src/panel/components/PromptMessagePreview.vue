<template>
  <div v-if="enabledMessages.length === 0" class="cv-preview-empty">暂无已启用条目</div>
  <div v-else class="cv-preview-list custom-scrollbar">
    <section v-for="message in enabledMessages" :key="message.id" class="cv-preview-block">
      <div class="cv-preview-body">
        <span v-if="isReservedMessage(message)" class="cv-preview-token">
          <span>{{ getReservedPreviewText(message) }}</span>
        </span>
        <pre v-else class="cv-preview-text">{{ getMessagePreviewText(message) }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { getPromptLlmMessageEntryKind, type PromptLlmMessage } from '@/constants/novelai';
import { getPromptLlmReservedPreviewText, isPromptLlmReservedMessage } from '@/services/prompt-llm/message-preset';
import { resolvePromptLlmSourceMessage } from '@/services/prompt-llm/message-source';

const props = defineProps<{ messages: PromptLlmMessage[] }>();

const sourcePreviewMap = ref<Record<string, string>>({});
const enabledMessages = computed(() => props.messages.filter(message => message.enabled !== false));
const sourcePreviewSignature = computed(() =>
  enabledMessages.value
    .filter(isSourceMessage)
    .map(message => `${message.id}:${message.reference?.worldbookName ?? ''}:${message.reference?.entryUid ?? ''}`)
    .join('|'),
);

let previewRequestId = 0;

watch(sourcePreviewSignature, refreshSourcePreviews, { immediate: true });

/**
 * 刷新来源条目的预览文本
 */
async function refreshSourcePreviews(): Promise<void> {
  const requestId = ++previewRequestId;
  const sourceMessages = enabledMessages.value.filter(isSourceMessage);
  const entries = await Promise.all(sourceMessages.map(async message => [message.id, await readSourcePreview(message)]));
  if (requestId === previewRequestId) sourcePreviewMap.value = Object.fromEntries(entries);
}

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

/**
 * 获取普通消息预览文本
 * @param message 消息条目
 * @returns 预览文本
 */
function getMessagePreviewText(message: PromptLlmMessage): string {
  if (!isSourceMessage(message)) return message.content;
  return sourcePreviewMap.value[message.id] ?? '正在读取资料...';
}

/**
 * 判断是否为来源型消息
 * @param message 消息条目
 * @returns 是否为来源型消息
 */
function isSourceMessage(message: PromptLlmMessage): boolean {
  return !isReservedMessage(message) && getPromptLlmMessageEntryKind(message) !== 'custom';
}

/**
 * 读取来源消息预览文本
 * @param message 消息条目
 * @returns 预览文本
 */
async function readSourcePreview(message: PromptLlmMessage): Promise<string> {
  const resolved = await resolvePromptLlmSourceMessage(message);
  if (!resolved) return '';
  if (resolved.status === 'ready') return resolved.content;
  return '来源失效，运行时会跳过该条目';
}
</script>

<style scoped>
@reference '../../global.css';

.cv-preview-list {
  @apply flex flex-col overflow-y-auto;
  gap: var(--cv-space-4xl);
  height: 16rem;
  min-height: 6rem;
  resize: vertical;
  padding: var(--cv-space-5xl);
  background: var(--p-content-background);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius);
  margin: 0 0 var(--cv-space-5xl) 0;
}

.cv-preview-body {
  @apply flex items-start;
  min-height: 1.5rem;
}

.cv-preview-token {
  @apply inline-flex select-none items-center;
  gap: var(--cv-space-sm);
  min-height: 2rem;
  padding: 0 var(--cv-space-lg);
  border: var(--cv-border-width) solid color-mix(in srgb, var(--p-primary-color) 60%, var(--p-content-border-color));
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  color: var(--p-primary-color);
}

.cv-preview-text {
  @apply m-0 w-full whitespace-pre-wrap break-words;
  min-height: 1.5rem;
  font-size: var(--cv-font-size-md);
  line-height: 1.5;
  color: var(--cv-on-surface);
}

.cv-preview-empty {
  @apply flex items-center justify-center text-center;
  min-height: 16rem;
  padding: var(--cv-space-8xl);
  color: var(--p-text-muted-color);
  background: var(--p-content-background);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius);
  margin: 0 0 var(--cv-space-5xl) 0;
}
</style>
