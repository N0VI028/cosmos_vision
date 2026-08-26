import {
  areChatParagraphsAdjacent,
  areChatParagraphsContiguous,
  sortChatParagraphsByDomOrder,
} from '@/services/sillytavern/chat-dom';
import { getHostIframe, getViewportRect } from '@/services/inline-image/iframe-utils';
import { resolveInlineRoute } from '@/services/inline-image/route-resolve';

/**
 * 判断当前选区与新目标元素是否属于不同路由类型（类型互斥守卫）
 * 选区为空时返回 false（无冲突）
 * @param current 当前选区元素数组
 * @param incoming 即将点击的目标元素
 * @returns 是否存在路由类型混合
 */
export function hasMixedRoute(current: HTMLElement[], incoming: HTMLElement): boolean {
  if (!current.length) return false;
  const targetRoute = resolveInlineRoute(incoming);
  return current.some(el => resolveInlineRoute(el) !== targetRoute);
}

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
 * iframe 内元素通过宿主 iframe 回到父文档查找，蒙版壳统一挂父文档（样式可用）
 * @param paragraphs 选中段落
 * @returns 容器元素
 */
export function getSelectionShellContainer(paragraphs: HTMLElement[]): HTMLElement | null {
  const first = paragraphs[0];
  if (!first) return null;
  const hostIframe = getHostIframe(first);
  const mesText = (hostIframe ?? first).closest('.mes_text');
  return mesText instanceof HTMLElement ? mesText : null;
}

/**
 * 按选中段落包围盒布局整体选区壳
 * 用首尾段落的包围盒相对容器定位，覆盖段间距
 * iframe 内元素的 rect 相对 iframe 自身视口，须用 getViewportRect 换算到父文档视口坐标系
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
  const firstRect = getViewportRect(first);
  const lastRect = getViewportRect(last);
  const left = Math.min(...paragraphs.map(p => getViewportRect(p).left)) - parentRect.left;
  const right = Math.max(...paragraphs.map(p => getViewportRect(p).right)) - parentRect.left;
  const top = firstRect.top - parentRect.top + container.scrollTop;
  shell.style.top = `${top}px`;
  shell.style.left = `${left + container.scrollLeft}px`;
  shell.style.width = `${Math.max(right - left, 0)}px`;
  shell.style.height = `${Math.max(lastRect.bottom - firstRect.top, 0)}px`;
}
