import type { PromptLlmContext, PromptLlmSettings } from '@/constants/novelai';
import { chat } from '@sillytavern/script';
import { stripSlotShortcodes } from '@/services/inline-image/slot-shortcode';
import { readPromptLlmHistoryMessages } from '@/services/tavern-helper/chat-history';
import { buildRegexedHistory } from '@/services/tavern-helper/history-builder';
import { extractFrontendText } from '@/services/inline-image/frontend-text-extract';
import { getHostIframe, isHTMLElementNode, tryAccessIframeDocument } from '@/services/inline-image/iframe-utils';

const MESSAGE_TEXT_BLOCK_SELECTOR = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';
const IGNORED_TEXT_BLOCK_TAGS = new Set(['HEAD', 'TITLE', 'SCRIPT', 'STYLE', 'BUTTON']);

/**
 * 跨 realm 判断元素是否为 HTMLIFrameElement
 * @param node 待检查节点
 * @returns 是否为 iframe 元素
 */
function isIframeElementNode(node: unknown): node is HTMLIFrameElement {
  return isHTMLElementNode(node) && node.tagName === 'IFRAME';
}

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
 * @returns 最后一个可见段落或可见消息正文
 */
export function findInlineFavoriteFallbackTarget(): InlineFavoriteAnchor | null {
  const paragraphs = getVisibleChatParagraphElements();
  const lastParagraph = paragraphs.at(-1);
  if (lastParagraph) return createInlineFavoriteAnchor(lastParagraph);
  const mesText = findVisibleMessageText();
  return mesText ? { target: mesText, placement: 'append', paragraph: null } : null;
}

/**
 * 获取容器内部的文本根节点（若包含 .mes_text 则在其内部查找，否则在容器根节点查找）
 * @param container 容器元素
 * @returns 根节点元素
 */
function getContainerRoot(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('.mes_text') ?? container;
}

/**
 * 获取指定容器内的扁平文本块元素列表
 * @param container 容器元素
 * @param hasIframeTarget 是否存在 iframe 目标（用于排除父文档中的 HTML 源码）
 * @returns 该容器内按 DOM 顺序排列的叶子文本块元素
 */
function getContainerTextBlockElements(container: HTMLElement, hasIframeTarget = false): HTMLElement[] {
  const root = getContainerRoot(container);
  const semanticBlocks = Array.from(
    root.querySelectorAll(`:is(${MESSAGE_TEXT_BLOCK_SELECTOR})`),
  ).filter(isLeafMessageTextBlock).filter(element =>
    !hasIframeTarget || !isFrontendSourceBlock(element),
  );
  const explicitBubbles = Array.from(root.querySelectorAll('[data-cv-selectable]')).filter(isHTMLElementNode);
  const implicitBubbles = getImplicitFrontendBubbles(root, semanticBlocks);
  return [...new Set([...semanticBlocks, ...explicitBubbles, ...implicitBubbles])]
    .sort(compareDomOrder);
}

/**
 * 获取目标段落所属消息内的全部语义块与前端型气泡（按 DOM 序递归展开 iframe 内部块）
 * @param targetP 目标段落 DOM 元素
 * @returns 同一条消息内按 DOM 顺序排列的叶子文本块数组
 */
function getMessageTextBlockElements(targetP: HTMLElement): HTMLElement[] {
  const mesBlock = (getHostIframe(targetP) ?? targetP).closest<HTMLElement>('[mesid]');
  if (!mesBlock) throw new Error('未找到目标段落所属消息');
  const hasIframe = Boolean(getHostIframe(targetP) || mesBlock.querySelector('iframe'));

  const parentBlocks = getContainerTextBlockElements(mesBlock, hasIframe);
  const iframeElements = getIframeBubbleBlocks(mesBlock);

  if (iframeElements.length === 0) {
    return parentBlocks;
  }

  const allBlocks: HTMLElement[] = [];
  const parentAndIframes = [...new Set([...parentBlocks, ...iframeElements])].sort(compareDomOrder);

  for (const element of parentAndIframes) {
    if (isIframeElementNode(element)) {
      const doc = tryAccessIframeDocument(element);
      if (doc?.body) {
        const innerBlocks = getContainerTextBlockElements(doc.body, false);
        if (innerBlocks.length > 0) {
          allBlocks.push(...innerBlocks);
        } else {
          allBlocks.push(element);
        }
      }
    } else {
      allBlocks.push(element);
    }
  }

  return allBlocks;
}

/**
 * 获取最内层的隐式前端型文本气泡
 * @param container 容器元素
 * @param semanticBlocks 已识别的普通语义块
 * @returns 不与显式气泡层级重叠的最内层气泡
 */
function getImplicitFrontendBubbles(container: HTMLElement, semanticBlocks: HTMLElement[]): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll('div')).filter(
    element => isImplicitFrontendBubble(element, semanticBlocks),
  );
  return candidates.filter(candidate => !candidates.some(other => other !== candidate && candidate.contains(other)));
}

/**
 * 获取楼层内可访问内容的外部 iframe
 * @param mesBlock 当前消息元素
 * @returns 同源可访问的 iframe 元素
 */
function getIframeBubbleBlocks(mesBlock: HTMLElement): HTMLIFrameElement[] {
  const root = getContainerRoot(mesBlock);
  return Array.from(root.querySelectorAll('iframe'))
    .filter(isIframeElementNode)
    .filter(element => tryAccessIframeDocument(element) !== null);
}

/**
 * 判断元素是否为有效的隐式前端型文本气泡
 * @param element 待判断元素
 * @param semanticBlocks 已识别的普通语义块
 * @returns 是否可作为隐式气泡候选
 */
function isImplicitFrontendBubble(element: Element, semanticBlocks: HTMLElement[]): boolean {
  return isHTMLElementNode(element)
    && Boolean(element.className)
    && Boolean(element.textContent?.trim())
    && !semanticBlocks.includes(element)
    && !hasCosmosInlineClass(element)
    && !element.querySelector(MESSAGE_TEXT_BLOCK_SELECTOR)
    && !element.closest('[data-cv-selectable]')
    && !element.querySelector('[data-cv-selectable]')
    && !element.closest('iframe')
    && element.tagName !== 'IFRAME';
}

/**
 * 按 DOM 文档顺序比较两个元素
 * @param left 左侧元素
 * @param right 右侧元素
 * @returns 排序比较值
 */
function compareDomOrder(left: HTMLElement, right: HTMLElement): number {
  const position = left.compareDocumentPosition(right);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * 提取目标段落所属 mes 的全部语义文本块
 * @param targetP 目标段落 DOM 元素
 * @param excludedElements 需按元素身份排除的文本块
 * @returns 整层历史文本块数组
 */
export function extractMessageParagraphs(targetP: HTMLElement, excludedElements?: HTMLElement[]): string[] {
  const excluded = new Set(excludedElements);
  const elements = getMessageTextBlockElements(targetP).filter(
    element => !excluded.has(element) && !Array.from(excluded).some(ex => element.contains(ex) || ex.contains(element)),
  );
  const messageBlocks = extractMessageTextBlockTexts(elements);
  if (messageBlocks.length > 0) return messageBlocks;
  if (excludedElements) return [];
  const focusParagraph = extractCleanParagraphText(targetP);
  return focusParagraph ? [focusParagraph] : [];
}

/**
 * 提取从消息开头到目标焦点段落的语义文本块
 * @param targetP 目标焦点段落 DOM 元素
 * @returns 截断后的历史文本块数组
 */
export function extractMessageParagraphsUntil(targetP: HTMLElement): string[] {
  const messageBlocks = getMessageTextBlockElements(targetP);
  const hostIframe = getHostIframe(targetP);
  const targetIndex = messageBlocks.findIndex(
    block => block === targetP || block.contains(targetP) || (hostIframe && block === hostIframe),
  );
  const visibleBlocks = targetIndex >= 0 ? messageBlocks.slice(0, targetIndex + 1) : [targetP];
  const paragraphs = extractMessageTextBlockTexts(visibleBlocks);
  if (paragraphs.length > 0) return paragraphs;
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
 * 提取语义文本块内的纯净文本（支持普通段落和前端型气泡）
 * @param element 语义文本块元素
 * @returns 规范化后的文本
 */
function extractMessageTextBlockText(element: HTMLElement): string {
  if (isIframeElementNode(element)) {
    const doc = tryAccessIframeDocument(element);
    return doc?.body ? extractFrontendText(doc.body) : '';
  }
  return element.hasAttribute('data-cv-selectable')
    ? extractFrontendText(element)
    : normalizeMessageTextBlock(readMessageTextNode(element));
}

/**
 * 从 Prompt LLM 历史段落中移除前端 HTML/CSS 源码
 * @param value 可能包含渲染源码的历史文本
 * @returns 去除源码后的历史文本
 */
export function stripFrontendSourceMarkup(value: string): string {
  return value
    .replace(/<!doctype\s+html\b[\s\S]*?<\/html\s*>/gi, '')
    .replace(/<html\b[\s\S]*?<\/html\s*>/gi, '')
    .replace(/<(title|style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 判断普通文本块是否是被 iframe 渲染器保留的 HTML 源码
 * @param element 待检查的文本块
 * @returns 是否应从 iframe 焦点历史中排除
 */
function isFrontendSourceBlock(element: HTMLElement): boolean {
  const text = element.textContent?.trim() ?? '';
  if (!text) return false;
  return stripFrontendSourceMarkup(text) !== text;
}

/**
 * 递归读取文本节点，并将 br 转为换行
 * @param node DOM 节点
 * @returns 节点文本
 */
function readMessageTextNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!isHTMLElementNode(node)) return '';
  if (IGNORED_TEXT_BLOCK_TAGS.has(node.tagName) || hasCosmosInlineClass(node)) return '';
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
  return Array.from(element.classList).some(className => {
    if (className === 'cv-render') return true;
    return className.startsWith('cv-inline') && className !== 'cv-inline-selected';
  });
}

/**
 * 判断语义块是否没有更深层语义块
 * @param element 语义文本块元素
 * @returns 是否作为本次抽取单位
 */
function isLeafMessageTextBlock(element: Element): element is HTMLElement {
  return isHTMLElementNode(element) && !element.querySelector(MESSAGE_TEXT_BLOCK_SELECTOR);
}

/**
 * 规范化语义文本块空白
 * @param text 原始文本
 * @returns 保留换行后的文本
 */
function normalizeMessageTextBlock(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 构建 Prompt LLM 所需的整层历史与焦点段落上下文
 * 当前焦点楼层走 DOM，向前追溯的楼层走 TavernHelper 正则处理后消息
 * @param targetP 当前焦点段落
 * @param settings Prompt LLM 历史楼层设置
 * @returns Prompt LLM 运行时上下文
 */
export function buildPromptLlmContextFromParagraph(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): Promise<PromptLlmContext> {
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
 * 使用 ST 正则处理后的历史消息
 * @param paragraphs 同一消息内连续段落（DOM 序）
 * @param settings Prompt LLM 历史楼层设置
 * @returns Prompt LLM 运行时上下文
 */
export async function buildPromptLlmContextFromParagraphs(
  paragraphs: HTMLElement[],
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): Promise<PromptLlmContext> {
  const focusParagraph = mergeFocusParagraphText(paragraphs);
  if (!focusParagraph) throw new Error('未找到目标段落文本');
  const anchor = paragraphs.at(-1);
  if (!anchor) throw new Error('未找到目标段落文本');
  return {
    historyParagraphs: await buildPromptLlmHistoryParagraphsWithRegex(anchor, settings),
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
  const mesBlock = (getHostIframe(targetP) ?? targetP).closest('[mesid]');
  if (!isHTMLElementNode(mesBlock)) return [];
  return Array.from(mesBlock.querySelectorAll('.mes_text p')).filter(isHTMLElementNode);
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
 * 读取当前选中的聊天段落（支持普通p段落和前端型气泡）
 * @returns 选中的段落元素数组
 */
export function getFocusedChatParagraphs(): HTMLElement[] {
  const selected = Array.from(document.querySelectorAll('.cv-inline-selected')).filter(isHTMLElementNode);
  return [...selected, ...getIframeSelectedElements()];
}

/**
 * 收集所有同源 iframe 内部带选中态的元素
 * @returns iframe 内选中元素数组
 */
function getIframeSelectedElements(): HTMLElement[] {
  const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
  const collected: HTMLElement[] = [];
  for (const iframe of iframes) {
    const doc = tryAccessIframeDocument(iframe);
    if (!doc) continue;
    for (const el of doc.querySelectorAll('.cv-inline-selected')) {
      if (isHTMLElementNode(el)) collected.push(el);
    }
  }
  return collected;
}

/**
 * 使用 ST 正则处理构建历史消息段落
 * 焦点楼层仅保留至焦点段落，避免将后续剧情作为既有历史发送
 * 历史楼层经过 prompt-only 正则处理，每条正则后消息作为独立段落，保留消息边界
 * @param targetP 当前焦点段落
 * @param settings Prompt LLM 历史楼层设置
 * @returns 按时间顺序拼接的历史消息
 */
export async function buildPromptLlmHistoryParagraphsWithRegex(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): Promise<string[]> {
  const currentParagraphs = extractMessageParagraphsUntil(targetP);
  const messageIndex = findMessageId(targetP);

  const parsedIndex = messageIndex ? parseInt(messageIndex, 10) : NaN;
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
    return buildPromptLlmHistoryParagraphs(targetP, settings);
  }

  const result = await buildRegexedHistory({
    currentMessageIndex: parsedIndex - 1,
    depthBaseline: chat.length - 1,
    historyFloorCount: settings.historyFloorCount,
    ignoreUserMessages: settings.ignoreUserMessagesInHistory,
    reverseOrder: false,
  });

  if (!result.success) {
    return buildPromptLlmHistoryParagraphs(targetP, settings);
  }

  const regexedParagraphs = result.messages.map(msg => msg.text).filter(Boolean);
  return [...regexedParagraphs, ...currentParagraphs];
}

/**
 * 构建排除焦点楼层的 Prompt LLM 历史段落（前端型气泡专用）
 * 焦点楼层文本由调用方独立提供，历史只含焦点楼层之前的正则处理消息
 * @param targetP 焦点气泡元素（用于定位消息索引）
 * @param settings Prompt LLM 历史楼层设置
 * @returns 历史段落数组
 */
export async function buildPromptLlmHistoryExcludingFocusFloor(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): Promise<string[]> {
  const messageIndex = findMessageId(targetP);
  const parsedIndex = messageIndex ? parseInt(messageIndex, 10) : NaN;
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return [];
  const result = await buildRegexedHistory({
    currentMessageIndex: parsedIndex - 1,
    depthBaseline: chat.length - 1,
    historyFloorCount: settings.historyFloorCount,
    ignoreUserMessages: settings.ignoreUserMessagesInHistory,
    reverseOrder: false,
  });
  if (!result.success) {
    return [];
  }
  return result.messages.map(msg => msg.text).filter(Boolean);
}

/**
 * 构建 Prompt LLM 历史消息数组（旧版，未使用 prompt 正则）
 * @deprecated 已废弃，请使用 buildPromptLlmHistoryParagraphsWithRegex
 * @param targetP 当前焦点段落
 * @param settings Prompt LLM 历史楼层设置
 * @returns 按时间顺序拼接的历史消息
 */
function buildPromptLlmHistoryParagraphs(
  targetP: HTMLElement,
  settings: Pick<PromptLlmSettings, 'historyFloorCount' | 'ignoreUserMessagesInHistory'>,
): string[] {
  const currentParagraphs = extractMessageParagraphsUntil(targetP);
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
  const mesBlock = (getHostIframe(p) ?? p).closest('[mesid]');
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
 * 读取段落文本 hash（剥离 cv 短码，保证重挂与摘码前后一致）
 * @param paragraph 段落元素
 * @returns hash 字符串
 */
export function getParagraphTextHash(paragraph: HTMLElement): string {
  return createInlineTextHash(stripSlotShortcodes(extractCleanParagraphText(paragraph)));
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
    .filter(isHTMLElementNode)
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
