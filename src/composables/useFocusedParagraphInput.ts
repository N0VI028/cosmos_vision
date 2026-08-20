import { computed, inject, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';

import type { PromptLlmContext } from '@/constants/novelai';
import { useSettingsStore } from '@/store/settings';
import {
  buildPromptLlmContextFromParagraphs,
  extractMessageParagraphs,
  findMessageId,
  getFocusedChatParagraphs,
  mergeFocusParagraphText,
} from '@/services/sillytavern/chat-dom';
import { readPromptLlmHistoryMessages } from '@/services/tavern-helper/chat-history';

interface FocusedParagraphInputState {
  paragraphText: Ref<string>;
  hasFocusedParagraph: ComputedRef<boolean>;
  buildTestContext: () => Promise<PromptLlmContext>;
}

export const FOCUSED_PARAGRAPH_TEXT_KEY = Symbol('focused-paragraph-text');
export const FOCUSED_PARAGRAPH_MESSAGE_ID_KEY = Symbol('focused-paragraph-message-id');
export const FOCUSED_PARAGRAPH_MESSAGE_PARAGRAPHS_KEY = Symbol('focused-paragraph-message-paragraphs');
export const FOCUSED_PARAGRAPH_ELEMENTS_KEY = Symbol('focused-paragraph-elements');

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
  const initialElements = inject<ComputedRef<HTMLElement[] | null> | null>(FOCUSED_PARAGRAPH_ELEMENTS_KEY, null);
  const paragraphText = ref(initialParagraphText?.value || initialValue);
  const messageId = ref<string | null>(initialMessageId?.value ?? null);
  const messageParagraphs = ref<string[]>([...(initialMessageParagraphs?.value ?? [])]);
  const focusElements = ref<HTMLElement[]>([...(initialElements?.value ?? [])]);
  const hasFocusedChatParagraph = ref(false);
  const hasFocusedParagraph = computed(() => hasFocusedChatParagraph.value || Boolean(paragraphText.value.trim()));

  /**
   * 获取当前焦点段落（优先从 DOM，降级从快照恢复）
   * 解决进入测试页后 DOM 选择状态丢失的竞态问题
   * 降级使用打开面板时捕获的焦点元素本身，保证前端型气泡等非 p 焦点不被误换
   * @returns 焦点段落数组，无焦点时返回空数组
   */
  function getFocusedParagraphsWithFallback(): HTMLElement[] {
    // 优先从 DOM 读取当前选中的段落
    const domParagraphs = getFocusedChatParagraphs();
    if (domParagraphs.length) {
      return domParagraphs;
    }

    // 降级：用打开面板时捕获的焦点元素（仍在 DOM 中时有效）
    return focusElements.value.filter(element => element.isConnected);
  }

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
  async function buildTestContext(): Promise<PromptLlmContext> {
    const focusedParagraphs = getFocusedParagraphsWithFallback();

    if (focusedParagraphs.length) {
      return await buildPromptLlmContextFromParagraphs(focusedParagraphs, settings.promptLlm);
    }

    return buildManualPromptLlmContext(
      paragraphText.value,
      messageId.value,
      messageParagraphs.value,
      settings.promptLlm,
    );
  }

  /**
   * 同步当前焦点段落文本与楼层快照
   */
  function syncFocusedParagraph(): void {
    const focusedParagraphs = getFocusedParagraphsWithFallback();
    hasFocusedChatParagraph.value = focusedParagraphs.length > 0;
    if (!focusedParagraphs.length) {
      syncInitialFocusedParagraph();
      return;
    }
    focusElements.value = focusedParagraphs;
    const anchor = focusedParagraphs.at(-1)!;
    paragraphText.value = mergeFocusParagraphText(focusedParagraphs);
    messageId.value = findMessageId(anchor);
    messageParagraphs.value = extractMessageParagraphs(anchor);
  }

  /**
   * 同步打开设置时捕获的焦点楼层快照
   * 从快照恢复时也应标记为有焦点段落，因为用户确实选择了段落
   */
  function syncInitialFocusedParagraph(): void {
    if (!paragraphText.value && initialParagraphText?.value) {
      paragraphText.value = initialParagraphText.value;
    }
    messageId.value ??= initialMessageId?.value ?? null;
    if (!messageParagraphs.value.length) {
      messageParagraphs.value = [...(initialMessageParagraphs?.value ?? [])];
    }
    // 如果快照有 messageId，说明用户确实选择了段落，应该标记为有焦点
    if (messageId.value) {
      hasFocusedChatParagraph.value = true;
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
