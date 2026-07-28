<template>
  <div
    v-if="enabledMessages.length === 0"
    class="mb-(--cv-space-5xl) flex min-h-64 items-center justify-center rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--p-content-border-color) bg-(--p-content-background) p-(--cv-space-8xl) text-center text-(--p-text-muted-color)"
  >
    暂无已启用条目
  </div>
  <div
    v-else
    class="custom-scrollbar mb-(--cv-space-5xl) flex h-64 min-h-24 resize-y flex-col gap-(--cv-space-4xl) overflow-y-auto rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--p-content-border-color) bg-(--p-content-background) p-(--cv-space-5xl)"
  >
    <section v-for="message in enabledMessages" :key="message.id">
      <div class="flex min-h-6 items-start">
        <pre
          class="m-0 min-h-6 w-full whitespace-pre-wrap wrap-break-word text-(length:--cv-font-size-base) leading-[1.5] text-(--cv-on-surface)"
        >{{ getMessagePreviewText(message) }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { getPromptLlmMessageEntryKind, type PromptLlmMessage } from '@/constants/novelai';
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
  return getPromptLlmMessageEntryKind(message) !== 'custom';
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
