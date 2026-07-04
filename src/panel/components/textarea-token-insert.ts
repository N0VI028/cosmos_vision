import { nextTick } from 'vue';

/** 文本选区范围 */
export interface TextRange {
  start: number;
  end: number;
}

/** PrimeVue Textarea 模板引用 */
export type TextareaRef = { $el?: HTMLElement } | HTMLElement | null;

/**
 * 读取 Textarea 原生元素
 * @param textareaRef Textarea 模板引用
 * @returns 原生文本框元素
 */
export function getTextareaElement(textareaRef: TextareaRef): HTMLTextAreaElement | null {
  const el = textareaRef instanceof HTMLElement ? textareaRef : textareaRef?.$el;
  return el instanceof HTMLTextAreaElement ? el : null;
}

/**
 * 读取宏插入选区
 * @param el 文本框元素
 * @param savedRange 上次记录的选区
 * @param content 当前内容
 * @returns 有效插入选区
 */
export function readTextareaInsertRange(
  el: HTMLTextAreaElement | null,
  savedRange: TextRange | null,
  content: string,
): TextRange {
  const range = readLiveTextareaSelection(el) ?? savedRange ?? { start: content.length, end: content.length };
  return clampTextRange(range, content.length);
}

/**
 * 替换指定文本选区
 * @param content 原始内容
 * @param range 替换选区
 * @param token 宏文本
 * @returns 替换后的内容
 */
export function replaceTextRange(content: string, range: TextRange, token: string): string {
  return `${content.slice(0, range.start)}${token}${content.slice(range.end)}`;
}

/**
 * 恢复 Textarea 焦点和光标位置
 * @param readElement 读取文本框的方法
 * @param position 光标位置
 * @param onFocused 聚焦后的回调
 */
export function focusTextareaAt(
  readElement: () => HTMLTextAreaElement | null,
  position: number,
  onFocused: (range: TextRange) => void,
): void {
  nextTick(() => {
    const el = readElement();
    if (!el) return;
    el.focus();
    el.setSelectionRange(position, position);
    onFocused({ start: position, end: position });
  });
}

/**
 * 读取当前活动输入框选区
 * @param el 文本框元素
 * @returns 输入框选区
 */
function readLiveTextareaSelection(el: HTMLTextAreaElement | null): TextRange | null {
  if (!el || document.activeElement !== el) return null;
  return { start: el.selectionStart, end: el.selectionEnd };
}

/**
 * 将文本选区限制在内容长度内
 * @param range 原始选区
 * @param length 内容长度
 * @returns 有效选区
 */
function clampTextRange(range: TextRange, length: number): TextRange {
  const start = Math.min(Math.max(range.start, 0), length);
  const end = Math.min(Math.max(range.end, start), length);
  return { start, end };
}
