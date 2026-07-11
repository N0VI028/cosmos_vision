import type { PromptLlmContext, PromptLlmSettings } from '@/constants/novelai';
import { chat } from '@sillytavern/script';
import { readPromptLlmHistoryMessages } from '@/services/tavern-helper/chat-history';

const MESSAGE_TEXT_BLOCK_SELECTOR = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';

/**
 * ST 聊天 DOM 段落定位与上下文抽取
 * 以当前可见聊天界面为准,不依赖 TavernHelper.getChatMessages
 */

export interface InlineFavoriteAnchor {
  target: HTMLElement;
  placement: 'after' | 'append';
  paragraph: HTMLElement | null;
  mesId?: string;
  swipeId?: number;
  paragraphTextHash?: string;
}

/**
 * 提取段落纯文本,剔除插件注入的浮窗按钮等非原文节点
 * @param p 段落 DOM 元素
 * @returns 段落文本(已去首尾空白)
 */
export function extractCleanParagraphText(p: HTMLElement): string {
  return normalizeMessageTextBlock(readMessageTextNode(p));
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
 * 获取当前可见聊天段落元素
 * @returns 可见段落元素数组
 */
export function getVisibleChatParagraphElements(): HTMLElement[] {
  return getChatParagraphElements().filter(isVisibleElement);
}

/**
 * 读取段落在当前聊天可见段落中的全局索引
 * @param paragraph 段落元素
 * @returns 全局段落索引,未找到返回 -1
 */
export function getGlobalParagraphIndex(paragraph: HTMLElement): number {
  return getVisibleChatParagraphElements().indexOf(paragraph);
}

/**
 * 按全局段落索引查找当前聊天段落
 * @param index 全局段落索引
 * @returns 命中的段落或 null
 */
export function findParagraphByGlobalIndex(index: number): HTMLElement | null {
  return getVisibleChatParagraphElements()[index] ?? null;
}

/**
 * 读取收藏图恢复的挂载锚点
 * @param index 收藏记录保存的全局段落索引
 * @returns 可插入锚点或 null
 */
export function getInlineFavoriteAnchor(index: number): InlineFavoriteAnchor | null {
  const paragraph = findParagraphByGlobalIndex(index);
  if (paragraph) return createInlineFavoriteAnchor(paragraph);
  return findInlineFavoriteFallbackTarget();
}

/**
 * 读取收藏图恢复兜底挂载点
 * @returns 最后可见段落或可见消息正文
 */
export function findInlineFavoriteFallbackTarget(): InlineFavoriteAnchor | null {
  const paragraphs = getVisibleChatParagraphElements();
  const lastParagraph = paragraphs.at(-1);
  if (lastParagraph) return createInlineFavoriteAnchor(lastParagraph);
  const mesText = findVisibleMessageText();
  return mesText ? { target: mesText, placement: 'append', paragraph: null } : null;
}

/**
 * 获取目标段落所属 mes 内的语义文本块元素
 * @param targetP 目标段落 DOM 元素
 * @returns 同一条 mes 内的文本块元素数组
 */
function getMessageTextBlockElements(targetP: HTMLElement): HTMLElement[] {
  const mesBlock = targetP.closest('[mesid]');
  if (!(mesBlock instanceof HTMLElement)) {
    throw new Error('未找到目标段落所属消息');
  }
  const elements = Array.from(mesBlock.querySelectorAll(`.mes_text :is(${MESSAGE_TEXT_BLOCK_SELECTOR})`));
  return elements.filter(isLeafMessageTextBlock);
}

/**
 * 提取目标段落所属 mes 的全部语义文本块
 * @param targetP 目标段落 DOM 元素
 * @returns 整层历史文本块数组
 */
export function extractMessageParagraphs(targetP: HTMLElement): string[] {
  const messageBlocks = extractMessageTextBlockTexts(getMessageTextBlockElements(targetP));
  if (messageBlocks.length > 0) return messageBlocks;
  const focusParagraph = extractCleanParagraphText(targetP);
  return focusParagraph ? [focusParagraph] : [];
}

/**
 * 批量提取语义文本块文本
 * @param elements 语义文本块元素
 * @returns 清理后的文本块数组
 */
function extractMessageTextBlockTexts(elements: HTMLElement[]): string[] {
  return elements.map(extractMessageTextBlockText).filter(Boolean);
}

/**
 * 提取单个语义文本块文本
 * @param element 语义文本块元素
 * @returns 已规范化空白的文本
 */
function extractMessageTextBlockText(element: HTMLElement): string {
  return normalizeMessageTextBlock(readMessageTextNode(element));
}

/**
 * 递归读取文本节点，并将 br 转为换行
 * @param node DOM 节点
 * @returns 节点文本
 */
function readMessageTextNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (hasCosmosInlineClass(node)) return '';
  if (node.tagName === 'BR') return '\n';
  return Array.from(node.childNodes).map(readMessageTextNode).join('');
}

/**
 * 判断元素是否为 CosmosVision 注入的内联装饰节点
 * 保留真实正文宿主上的选中态 class,只跳过插件附加内容
 * @param element 待检查元素
 * @returns 是否应跳过该节点
 */
function hasCosmosInlineClass(element: HTMLElement): boolean {
  return Array.from(element.classList).some(className => className.startsWith('cv-inline') && className !== 'cv-inline-selected');
}

/**
 * 判断语义块是否没有更深层语义块
 * @param element 语义文本块元素
 * @returns 是否作为本次抽取单位
 */
function isLeafMessageTextBlock(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && !element.querySelector(MESSAGE_TEXT_BLOCK_SELECTOR);
}

/**
 * 规范化语义文本块空白
 * @param text 原始文本
 * @returns 保留换行后的文本
 */
function normalizeMessageTextBlock(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

/**
 * 构建 Prompt LLM 所需的整层历史与焦点段落上下文
 * 当前焦点楼层走 DOM，向前追溯的楼层走 TavernHelper 原始消息
 * @param targetP 当前焦点段落
 * @param settings Prompt LLM 历史楼层设置
 * @returns Prompt LLM 运行时上下文
 */
export function buildPromptLlmContextFromParagraph(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): PromptLlmContext {
  return buildPromptLlmContextFromParagraphs([targetP], settings);
}

/**
 * 将连续段落合并为焦点段落文本
 * @param paragraphs 按 DOM 顺序的段落元素
 * @returns 以单换行拼接的焦点文本
 */
export function mergeFocusParagraphText(paragraphs: HTMLElement[]): string {
  return paragraphs.map(extractCleanParagraphText).filter(Boolean).join('\n');
}

/**
 * 从连续选区构建 Prompt LLM 上下文
 * 历史以锚点末段所在楼层为准，焦点为合并后的多段正文
 * @param paragraphs 同一消息内连续段落（DOM 序）
 * @param settings Prompt LLM 历史楼层设置
 * @returns Prompt LLM 运行时上下文
 */
export function buildPromptLlmContextFromParagraphs(
  paragraphs: HTMLElement[],
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): PromptLlmContext {
  const focusParagraph = mergeFocusParagraphText(paragraphs);
  if (!focusParagraph) throw new Error('未找到目标段落文本');
  const anchor = paragraphs.at(-1);
  if (!anchor) throw new Error('未找到目标段落文本');
  return {
    historyParagraphs: buildPromptLlmHistoryParagraphs(anchor, settings),
    focusParagraph,
    specialRequest: '',
  };
}

/**
 * 获取目标段落所属消息内的聊天段落列表
 * @param targetP 目标段落
 * @returns 同消息 `.mes_text p` 元素（DOM 序）
 */
export function getMessageChatParagraphs(targetP: HTMLElement): HTMLElement[] {
  const mesBlock = targetP.closest('[mesid]');
  if (!(mesBlock instanceof HTMLElement)) return [];
  return Array.from(mesBlock.querySelectorAll('.mes_text p')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

/**
 * 判断两段落是否在同一消息内索引相邻
 * @param a 段落 A
 * @param b 段落 B
 * @returns 是否相邻
 */
export function areChatParagraphsAdjacent(a: HTMLElement, b: HTMLElement): boolean {
  if (findMessageId(a) !== findMessageId(b)) return false;
  const siblings = getMessageChatParagraphs(a);
  const indexA = siblings.indexOf(a);
  const indexB = siblings.indexOf(b);
  return indexA >= 0 && indexB >= 0 && Math.abs(indexA - indexB) === 1;
}

/**
 * 判断段落列表是否为同一消息内的连续块
 * @param paragraphs 段落列表
 * @returns 是否连续
 */
export function areChatParagraphsContiguous(paragraphs: HTMLElement[]): boolean {
  if (paragraphs.length <= 1) return true;
  const sorted = sortChatParagraphsByDomOrder(paragraphs);
  const siblings = getMessageChatParagraphs(sorted[0]!);
  const indexes = sorted.map(p => siblings.indexOf(p));
  if (indexes.some(index => index < 0)) return false;
  return indexes.every((index, i) => i === 0 || index === indexes[i - 1]! + 1);
}

/**
 * 按消息内 DOM 顺序排列段落
 * @param paragraphs 段落列表
 * @returns 排序后的新数组
 */
export function sortChatParagraphsByDomOrder(paragraphs: HTMLElement[]): HTMLElement[] {
  if (paragraphs.length <= 1) return [...paragraphs];
  const siblings = getMessageChatParagraphs(paragraphs[0]!);
  return [...paragraphs].sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
}

/**
 * 读取当前焦点聊天段落（多选时返回锚点末段）
 * @returns 当前带选中态的聊天段落,未找到返回 null
 */
export function getFocusedChatParagraph(): HTMLElement | null {
  return getFocusedChatParagraphs().at(-1) ?? null;
}

/**
 * 读取当前全部带选中态的聊天段落（DOM 序）
 * @returns 选中段落数组
 */
export function getFocusedChatParagraphs(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.mes_text p.cv-inline-selected')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

/**
 * 构建 Prompt LLM 历史消息数组
 * 焦点楼层始终保留，并追加到更早楼层原始消息之后
 * @param targetP 当前焦点段落
 * @param settings Prompt LLM 历史楼层设置
 * @returns 按时间顺序拼接的历史消息
 */
function buildPromptLlmHistoryParagraphs(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): string[] {
  const currentParagraphs = extractMessageParagraphs(targetP);
  const messageId = findMessageId(targetP);
  const previousMessages = readPromptLlmHistoryMessages(messageId, {
    historyFloorCount: settings.historyFloorCount,
    ignoreUserMessages: settings.ignoreUserMessagesInHistory,
  });
  return [...previousMessages, ...currentParagraphs];
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
 * 从段落 DOM 读取当前 ST swipe 版本
 * @param p 段落元素
 * @returns 当前 swipe_id,无 swipe 时返回 null
 */
export function findMessageSwipeId(p: HTMLElement): number | null {
  return getMessageSwipeId(findMessageId(p));
}

/**
 * 读取指定楼层当前激活的 ST swipe 版本
 * @param messageId ST 消息楼层 ID
 * @returns 当前 swipe_id,无效时返回 null
 */
export function getMessageSwipeId(messageId: string | number | null | undefined): number | null {
  const index = normalizeMessageIndex(messageId);
  if (index === null) return null;
  const message = (chat as unknown[])[index];
  return isChatSwipeMessage(message) ? normalizeSwipeId(message.swipe_id) : null;
}

/**
 * 创建带 ST 楼层与 swipe 信息的收藏锚点
 * @param paragraph 段落元素
 * @returns 收藏图挂载锚点
 */
export function createInlineFavoriteAnchor(paragraph: HTMLElement): InlineFavoriteAnchor {
  return {
    target: paragraph,
    placement: 'after',
    paragraph,
    mesId: findMessageId(paragraph) ?? undefined,
    swipeId: findMessageSwipeId(paragraph) ?? undefined,
    paragraphTextHash: getParagraphTextHash(paragraph),
  };
}

/**
 * 读取段落文本 hash
 * @param paragraph 段落元素
 * @returns hash 字符串
 */
export function getParagraphTextHash(paragraph: HTMLElement): string {
  return createInlineTextHash(extractCleanParagraphText(paragraph));
}

/**
 * 创建段落收藏用的轻量文本 hash
 * @param value 原始文本
 * @returns 稳定短 hash
 */
export function createInlineTextHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
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

/**
 * 查找可见消息正文容器
 * @returns 最后一个可见消息正文或 null
 */
function findVisibleMessageText(): HTMLElement | null {
  return Array.from(document.querySelectorAll('.mes .mes_text, .mes_text'))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .filter(isVisibleElement)
    .at(-1) ?? null;
}

/**
 * 规范化 ST 消息楼层索引
 * @param messageId 原始楼层 ID
 * @returns 可用于 chat[] 的索引
 */
function normalizeMessageIndex(messageId: string | number | null | undefined): number | null {
  if (typeof messageId === 'string' && !messageId.trim()) return null;
  const index = typeof messageId === 'number' ? messageId : Number(messageId);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * 判断值是否为可读取 swipe_id 的消息对象
 * @param value 原始值
 * @returns 是否为消息对象
 */
function isChatSwipeMessage(value: unknown): value is { swipe_id?: unknown } {
  return Boolean(value && typeof value === 'object');
}

/**
 * 规范化 ST swipe_id 字段
 * @param value 原始 swipe_id
 * @returns 有效 swipe_id 或 null
 */
function normalizeSwipeId(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

/**
 * 判断元素是否在当前页面布局中可见
 * @param element 待检查元素
 * @returns 是否可见
 */
function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}
