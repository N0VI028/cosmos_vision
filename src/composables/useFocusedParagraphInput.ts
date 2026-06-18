import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

import type { PromptLlmContext } from '@/constants/novelai';
import {
  buildPromptLlmContextFromParagraph,
  extractCleanParagraphText,
  getFocusedChatParagraph,
} from '@/services/sillytavern/chat-dom';

interface FocusedParagraphInputState {
  paragraphText: Ref<string>;
  hasFocusedParagraph: Ref<boolean>;
  buildTestContext: () => PromptLlmContext;
}

/**
 * 管理测试面板使用的焦点段落输入
 * 自动同步聊天焦点段落，同时保留手动输入兜底
 * @param initialValue 初始化文本
 * @returns 焦点段落输入状态与上下文构建函数
 */
export function useFocusedParagraphInput(initialValue = ''): FocusedParagraphInputState {
  const paragraphText = ref(initialValue);
  const hasFocusedParagraph = ref(false);

  onMounted(() => {
    syncFocusedParagraph(paragraphText, hasFocusedParagraph);
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
      syncFocusedParagraph(paragraphText, hasFocusedParagraph);
    }, 50);
  }

  /**
   * 构建当前测试所需的 Prompt LLM 上下文
   * @returns 可发送给 LLM 的上下文对象
   */
  function buildTestContext(): PromptLlmContext {
    const focusedParagraph = getFocusedChatParagraph();
    if (!focusedParagraph) {
      return buildManualPromptLlmContext(paragraphText.value);
    }
    return buildPromptLlmContextFromParagraph(focusedParagraph);
  }

  return { paragraphText, hasFocusedParagraph, buildTestContext };
}

/**
 * 同步当前焦点段落文本
 * @param paragraphText 测试输入文本
 * @param hasFocusedParagraph 是否有焦点段落
 */
function syncFocusedParagraph(paragraphText: Ref<string>, hasFocusedParagraph: Ref<boolean>): void {
  const focusedParagraph = getFocusedChatParagraph();
  hasFocusedParagraph.value = Boolean(focusedParagraph);
  if (!focusedParagraph) return;
  paragraphText.value = extractCleanParagraphText(focusedParagraph);
}

/**
 * 仅根据手动输入构建测试上下文
 * @param content 手动输入内容
 * @returns Prompt LLM 上下文对象
 */
function buildManualPromptLlmContext(content: string): PromptLlmContext {
  const focusParagraph = content.trim();
  return {
    historyParagraphs: focusParagraph ? [focusParagraph] : [],
    focusParagraph,
  };
}
