import { computed, inject, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';

import type { PromptLlmContext } from '@/constants/novelai';
import { useSettingsStore } from '@/store/settings';
import {
  buildPromptLlmContextFromParagraph,
  extractCleanParagraphText,
  extractMessageParagraphs,
  findMessageId,
  getFocusedChatParagraph,
} from '@/services/sillytavern/chat-dom';
import { readPromptLlmHistoryMessages } from '@/services/tavern-helper/chat-history';

interface FocusedParagraphInputState {
  paragraphText: Ref<string>;
  hasFocusedParagraph: ComputedRef<boolean>;
  buildTestContext: () => PromptLlmContext;
}

export const FOCUSED_PARAGRAPH_TEXT_KEY = Symbol('focused-paragraph-text');
export const FOCUSED_PARAGRAPH_MESSAGE_ID_KEY = Symbol('focused-paragraph-message-id');
export const FOCUSED_PARAGRAPH_MESSAGE_PARAGRAPHS_KEY = Symbol('focused-paragraph-message-paragraphs');

/**
 * 管理测试面板使用的焦点段落输入
 * 自动同步聊天焦点段落，同时保留手动输入兜底
 * @param initialValue 初始化文本
 * @returns 焦点段落输入状态与上下文构建函数
 */
export function useFocusedParagraphInput(initialValue = ''): FocusedParagraphInputState {
  const { settings } = useSettingsStore();
  const initialParagraphText = inject<ComputedRef<string> | null>(FOCUSED_PARAGRAPH_TEXT_KEY, null);
  const initialMessageId = inject<ComputedRef<string | null> | null>(FOCUSED_PARAGRAPH_MESSAGE_ID_KEY, null);
  const initialMessageParagraphs = inject<ComputedRef<string[]> | null>(FOCUSED_PARAGRAPH_MESSAGE_PARAGRAPHS_KEY, null);
  const paragraphText = ref(initialParagraphText?.value || initialValue);
  const messageId = ref<string | null>(initialMessageId?.value ?? null);
  const messageParagraphs = ref<string[]>([...(initialMessageParagraphs?.value ?? [])]);
  const hasFocusedChatParagraph = ref(false);
  const hasFocusedParagraph = computed(() => hasFocusedChatParagraph.value || Boolean(paragraphText.value.trim()));

  onMounted(() => {
    syncFocusedParagraph();
    document.addEventListener('pointerup', handleDocumentPointerUp, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerup', handleDocumentPointerUp, true);
  });

  /**
   * 监听聊天点击后同步新的焦点段落
   * 使用 pointerup 替代 click，避免被其他插件的 touchend.preventDefault() 阻断
   */
  function handleDocumentPointerUp(): void {
    window.setTimeout(() => {
      syncFocusedParagraph();
    }, 50);
  }

  /**
   * 构建当前测试所需的 Prompt LLM 上下文
   * @returns 可发送给 LLM 的上下文对象
   */
  function buildTestContext(): PromptLlmContext {
    const focusedParagraph = getFocusedChatParagraph();
    if (!focusedParagraph) {
      return buildManualPromptLlmContext(
        paragraphText.value,
        messageId.value,
        messageParagraphs.value,
        settings.promptLlm,
      );
    }
    return buildPromptLlmContextFromParagraph(focusedParagraph, settings.promptLlm);
  }

  /**
   * 同步当前焦点段落文本与楼层快照
   */
  function syncFocusedParagraph(): void {
    const focusedParagraph = getFocusedChatParagraph();
    hasFocusedChatParagraph.value = Boolean(focusedParagraph);
    if (!focusedParagraph) {
      syncInitialFocusedParagraph();
      return;
    }
    paragraphText.value = extractCleanParagraphText(focusedParagraph);
    messageId.value = findMessageId(focusedParagraph);
    messageParagraphs.value = extractMessageParagraphs(focusedParagraph);
  }

  /**
   * 同步打开设置时捕获的焦点楼层快照
   */
  function syncInitialFocusedParagraph(): void {
    if (!paragraphText.value && initialParagraphText?.value) {
      paragraphText.value = initialParagraphText.value;
    }
    messageId.value ??= initialMessageId?.value ?? null;
    if (!messageParagraphs.value.length) {
      messageParagraphs.value = [...(initialMessageParagraphs?.value ?? [])];
    }
  }

  return { paragraphText, hasFocusedParagraph, buildTestContext };
}

/**
 * 仅根据手动输入构建测试上下文
 * @param content 手动输入内容
 * @returns Prompt LLM 上下文对象
 */
function buildManualPromptLlmContext(
  content: string,
  messageId: string | null,
  messageParagraphs: string[],
  settings: { historyFloorCount: number; ignoreUserMessagesInHistory: boolean },
): PromptLlmContext {
  const focusParagraph = content.trim();
  const currentParagraphs = normalizeManualMessageParagraphs(messageParagraphs, focusParagraph);
  const historyParagraphs = readPromptLlmHistoryMessages(messageId, {
    historyFloorCount: settings.historyFloorCount,
    ignoreUserMessages: settings.ignoreUserMessagesInHistory,
  });
  return {
    historyParagraphs: [...historyParagraphs, ...currentParagraphs],
    focusParagraph,
    specialRequest: '',
  };
}

/**
 * 规范化手动测试使用的当前楼层段落
 * @param messageParagraphs 当前楼层段落快照
 * @param focusParagraph 焦点段落文本
 * @returns 可加入历史上下文的当前楼层段落
 */
function normalizeManualMessageParagraphs(messageParagraphs: string[], focusParagraph: string): string[] {
  const paragraphs = messageParagraphs.map(paragraph => paragraph.trim()).filter(Boolean);
  return paragraphs.length ? paragraphs : focusParagraph ? [focusParagraph] : [];
}
