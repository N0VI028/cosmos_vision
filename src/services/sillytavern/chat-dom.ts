import type { PromptLlmContext } from '@/constants/novelai';

/**
 * ST 聊天 DOM 段落定位与上下文抽取
 * 以当前可见聊天界面为准,不依赖 TavernHelper.getChatMessages
 */

/**
 * 提取段落纯文本,剔除插件注入的浮窗按钮等非原文节点
 * @param p 段落 DOM 元素
 * @returns 段落文本(已去首尾空白)
 */
export function extractCleanParagraphText(p: HTMLElement): string {
  // 克隆后剥离插件注入节点,避免污染原文
  const clone = p.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cv-inline-gen-btn').forEach(el => el.remove());
  return clone.textContent?.trim() ?? '';
}

/**
 * 批量提取段落纯文本
 * @param paragraphs 段落 DOM 列表
 * @returns 清理后的段落文本数组
 */
function extractParagraphTexts(paragraphs: HTMLElement[]): string[] {
  return paragraphs.map(extractCleanParagraphText).filter(Boolean);
}

/**
 * 从聊天 DOM 中提取所有可见段落
 * @returns 段落文本数组,按 DOM 顺序排列
 */
export function extractAllParagraphs(): string[] {
  return extractParagraphTexts(getChatParagraphElements());
}

/**
 * 获取聊天区全部段落元素
 * @returns 按 DOM 顺序排列的段落元素数组
 */
export function getChatParagraphElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.mes_text p'));
}

/**
 * 获取目标段落所属 mes 内的全部段落元素
 * @param targetP 目标段落 DOM 元素
 * @returns 同一条 mes 内的段落元素数组
 */
function getMessageParagraphElements(targetP: HTMLElement): HTMLElement[] {
  const mesBlock = targetP.closest('[mesid]');
  if (!(mesBlock instanceof HTMLElement)) {
    throw new Error('未找到目标段落所属消息');
  }
  return Array.from(mesBlock.querySelectorAll('.mes_text p'));
}

/**
 * 提取目标段落所属 mes 的全部段落文本
 * @param targetP 目标段落 DOM 元素
 * @returns 整层历史段落文本数组
 */
export function extractMessageParagraphs(targetP: HTMLElement): string[] {
  const historyParagraphs = extractParagraphTexts(getMessageParagraphElements(targetP));
  if (historyParagraphs.length > 0) return historyParagraphs;
  const focusParagraph = extractCleanParagraphText(targetP);
  return focusParagraph ? [focusParagraph] : [];
}

/**
 * 构建 Prompt LLM 所需的整层历史与焦点段落上下文
 * @param targetP 当前焦点段落
 * @returns Prompt LLM 运行时上下文
 */
export function buildPromptLlmContextFromParagraph(targetP: HTMLElement): PromptLlmContext {
  const focusParagraph = extractCleanParagraphText(targetP);
  if (!focusParagraph) {
    throw new Error('未找到目标段落文本');
  }
  return {
    historyParagraphs: extractMessageParagraphs(targetP),
    focusParagraph,
    specialRequest: '',
  };
}

/**
 * 读取当前焦点聊天段落
 * @returns 当前带选中态的聊天段落,未找到返回 null
 */
export function getFocusedChatParagraph(): HTMLElement | null {
  const paragraph = document.querySelector('.mes_text p.cv-inline-selected');
  return paragraph instanceof HTMLElement ? paragraph : null;
}

/**
 * 从段落 DOM 向上查找所属消息的 mesid
 * @param p 段落 DOM 元素
 * @returns mesid 字符串,未找到返回 null
 */
export function findMessageId(p: HTMLElement): string | null {
  const mesBlock = p.closest('[mesid]');
  return mesBlock?.getAttribute('mesid') ?? null;
}

/**
 * 从任意 DOM 元素向上查找其所属的聊天段落 p
 * 兼容 `<p>` 内部嵌套 `<em>` / `<q>` / `<strong>` 等内联元素的点击
 * @param el 点击目标元素
 * @returns 所属的 `.mes_text` 下的 `<p>` 元素,未找到返回 null
 */
export function findChatParagraph(el: HTMLElement): HTMLElement | null {
  return el.closest('.mes_text p');
}
