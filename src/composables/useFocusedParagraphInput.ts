import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

import {
  getChatParagraphElements,
  getFocusedChatParagraph,
  normalizeContextParagraphCount,
} from '@/services/sillytavern/chat-dom';

interface FocusedParagraphInputState {
  paragraphText: Ref<string>;
  hasFocusedParagraph: Ref<boolean>;
  buildTestContext: (contextParagraphCount: number) => string[];
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
    document.addEventListener('click', handleDocumentClick, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick, true);
  });

  /**
   * 监听聊天点击后同步新的焦点段落
   */
  function handleDocumentClick(): void {
    window.setTimeout(() => {
      syncFocusedParagraph(paragraphText, hasFocusedParagraph);
    }, 50);
  }

  /**
   * 构建当前测试所需的段落上下文
   * @param contextParagraphCount 焦点段落前后段落数
   * @returns 可发送给 LLM 的上下文数组
   */
  function buildTestContext(contextParagraphCount: number): string[] {
    const focusedParagraph = getFocusedChatParagraph();
    if (!focusedParagraph) return buildManualTestContext(paragraphText.value);

    const paragraphs = getChatParagraphElements();
    const targetIndex = paragraphs.indexOf(focusedParagraph);
    if (targetIndex === -1) return buildManualTestContext(paragraphText.value);

    return sliceFocusedParagraphContext(paragraphs, targetIndex, paragraphText.value, contextParagraphCount);
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
  paragraphText.value = extractCleanText(focusedParagraph);
}

/**
 * 仅根据手动输入构建测试上下文
 * @param content 手动输入内容
 * @returns 上下文数组
 */
function buildManualTestContext(content: string): string[] {
  const trimmed = content.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * 截取焦点段落附近的上下文
 * @param paragraphs 聊天段落列表
 * @param targetIndex 焦点段落索引
 * @param paragraphText 当前测试输入文本
 * @param contextParagraphCount 焦点段落前后段落数
 * @returns 上下文数组
 */
function sliceFocusedParagraphContext(
  paragraphs: HTMLElement[],
  targetIndex: number,
  paragraphText: string,
  contextParagraphCount: number,
): string[] {
  const radius = normalizeContextParagraphCount(contextParagraphCount);
  const start = Math.max(0, targetIndex - radius);
  const end = Math.min(paragraphs.length, targetIndex + radius + 1);
  return paragraphs.slice(start, end).map((paragraph, index) => {
    return start + index === targetIndex ? paragraphText : extractCleanText(paragraph);
  });
}

/**
 * 读取段落纯文本并移除插件按钮
 * @param paragraph 段落元素
 * @returns 清理后的文本
 */
function extractCleanText(paragraph: HTMLElement): string {
  const clone = paragraph.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cv-inline-gen-btn').forEach(element => element.remove());
  return clone.textContent?.trim() ?? '';
}
