import {
  areChatParagraphsAdjacent,
  areChatParagraphsContiguous,
  sortChatParagraphsByDomOrder,
} from '@/services/sillytavern/chat-dom';

/**
 * 判断目标段是否可邻接扩展当前选区
 * @param current 当前选区
 * @param p 目标段落
 * @returns 是否可扩展
 */
export function canExtendParagraphSelection(current: HTMLElement[], p: HTMLElement): boolean {
  if (!current.length) return false;
  const sorted = sortChatParagraphsByDomOrder(current);
  const head = sorted[0]!;
  const tail = sorted.at(-1)!;
  return areChatParagraphsAdjacent(p, head) || areChatParagraphsAdjacent(p, tail);
}

/**
 * 根据点击目标计算下一活动选区
 * @param current 当前选区
 * @param p 点击段落
 * @returns 新选区（空数组表示清空）
 */
export function nextParagraphSelection(current: HTMLElement[], p: HTMLElement): HTMLElement[] {
  if (current.includes(p)) return removeParagraphFromSelection(current, p);
  if (canExtendParagraphSelection(current, p)) {
    return sortChatParagraphsByDomOrder([...current, p]);
  }
  return [p];
}

/**
 * 从选区移除段落；剩余不连续则清空
 * @param current 当前选区
 * @param p 待移除段落
 * @returns 新选区
 */
function removeParagraphFromSelection(current: HTMLElement[], p: HTMLElement): HTMLElement[] {
  const next = current.filter(item => item !== p);
  if (!next.length || !areChatParagraphsContiguous(next)) return [];
  return sortChatParagraphsByDomOrder(next);
}

/**
 * 读取选区挂载容器（消息正文）
 * @param paragraphs 选中段落
 * @returns 容器元素
 */
export function getSelectionShellContainer(paragraphs: HTMLElement[]): HTMLElement | null {
  const first = paragraphs[0];
  if (!first) return null;
  const mesText = first.closest('.mes_text');
  return mesText instanceof HTMLElement ? mesText : null;
}

/**
 * 按选中段落包围盒布局整体选区壳
 * 用首尾段落的 getBoundingClientRect 相对容器定位，覆盖段间距
 * @param shell 选区壳元素
 * @param paragraphs 选中段落
 * @param container 挂载容器
 */
export function layoutSelectionShell(
  shell: HTMLElement,
  paragraphs: HTMLElement[],
  container: HTMLElement,
): void {
  const first = paragraphs[0];
  const last = paragraphs.at(-1);
  if (!first || !last) return;
  const parentRect = container.getBoundingClientRect();
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  const left = Math.min(...paragraphs.map(p => p.getBoundingClientRect().left)) - parentRect.left;
  const right = Math.max(...paragraphs.map(p => p.getBoundingClientRect().right)) - parentRect.left;
  shell.style.top = `${firstRect.top - parentRect.top + container.scrollTop}px`;
  shell.style.left = `${left + container.scrollLeft}px`;
  shell.style.width = `${Math.max(right - left, 0)}px`;
  shell.style.height = `${Math.max(lastRect.bottom - firstRect.top, 0)}px`;
}
