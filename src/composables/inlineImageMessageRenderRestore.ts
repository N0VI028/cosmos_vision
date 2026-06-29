import type { InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  getGlobalParagraphIndex,
  getMessageSwipeId,
  getParagraphTextHash,
  getVisibleChatParagraphElements,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';
import { event_types, eventSource } from '@sillytavern/script';

export interface InlineImageMessageRenderRestorer {
  dispose: () => void;
}

interface InlineImageMessageRenderRestoreOptions {
  getRestoreToken: () => number;
  isDisposed: () => boolean;
  readRecords: () => Promise<InlineImageFavoriteListItem[] | null>;
  remountGroups: (anchors: Map<number, InlineFavoriteAnchor>) => void;
  mergeFavoriteRecords: (index: number, anchor: InlineFavoriteAnchor, records: InlineImageFavoriteListItem[]) => void;
}

interface InlineImageMessageRenderRestoreState extends InlineImageMessageRenderRestoreOptions {
  timer: number | null;
  pendingMessageIds: Set<string>;
  schedule: (messageId: unknown) => void;
}

/**
 * 创建 ST 单条消息渲染后的段落图片恢复器
 * @param options 恢复依赖
 * @returns 恢复器控制句柄
 */
export function createInlineImageMessageRenderRestorer(
  options: InlineImageMessageRenderRestoreOptions,
): InlineImageMessageRenderRestorer {
  const state = createRestoreState(options);
  registerMessageRenderEvents(state);
  return { dispose: () => disposeMessageRenderRestorer(state) };
}

/**
 * 创建消息渲染恢复状态
 * @param options 恢复依赖
 * @returns 恢复状态
 */
function createRestoreState(options: InlineImageMessageRenderRestoreOptions): InlineImageMessageRenderRestoreState {
  const state: InlineImageMessageRenderRestoreState = {
    ...options,
    timer: null,
    pendingMessageIds: new Set(),
    schedule: () => undefined,
  };
  state.schedule = messageId => scheduleMessageRestore(state, messageId);
  return state;
}

/**
 * 注册用户与角色消息渲染事件
 * @param state 恢复状态
 */
function registerMessageRenderEvents(state: InlineImageMessageRenderRestoreState): void {
  eventSource.makeLast(event_types.MESSAGE_UPDATED, state.schedule);
  eventSource.makeLast(event_types.MESSAGE_SWIPED, state.schedule);
  eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, state.schedule);
  eventSource.makeLast(event_types.USER_MESSAGE_RENDERED, state.schedule);
}

/**
 * 注销消息渲染恢复器
 * @param state 恢复状态
 */
function disposeMessageRenderRestorer(state: InlineImageMessageRenderRestoreState): void {
  if (state.timer !== null) window.clearTimeout(state.timer);
  state.timer = null;
  state.pendingMessageIds.clear();
  eventSource.removeListener(event_types.MESSAGE_UPDATED, state.schedule);
  eventSource.removeListener(event_types.MESSAGE_SWIPED, state.schedule);
  eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, state.schedule);
  eventSource.removeListener(event_types.USER_MESSAGE_RENDERED, state.schedule);
}

/**
 * 延迟恢复单条消息内的段落图片,等待本轮消息 DOM 渲染稳定
 * @param state 恢复状态
 * @param messageId ST 消息楼层 ID
 */
function scheduleMessageRestore(state: InlineImageMessageRenderRestoreState, messageId: unknown): void {
  const normalizedId = normalizeMessageRenderId(messageId);
  if (!normalizedId || state.isDisposed()) return;
  state.pendingMessageIds.add(normalizedId);
  if (state.timer !== null) return;
  state.timer = window.setTimeout(() => flushMessageRestore(state), 60);
}

/**
 * 执行已排队的消息恢复
 * @param state 恢复状态
 */
function flushMessageRestore(state: InlineImageMessageRenderRestoreState): void {
  state.timer = null;
  const messageIds = Array.from(state.pendingMessageIds);
  state.pendingMessageIds.clear();
  void restoreRenderedMessages(state, messageIds);
}

/**
 * 规范化 ST 消息渲染事件传入的楼层 ID
 * @param messageId 原始事件参数
 * @returns 可匹配 mesid 的字符串
 */
function normalizeMessageRenderId(messageId: unknown): string | null {
  if (typeof messageId === 'number' && Number.isFinite(messageId)) return String(messageId);
  if (typeof messageId !== 'string') return null;
  const trimmed = messageId.trim();
  return trimmed ? trimmed : null;
}

/**
 * 恢复指定消息楼层内的段落图片
 * @param state 恢复状态
 * @param messageIds 消息楼层 ID 列表
 */
async function restoreRenderedMessages(
  state: InlineImageMessageRenderRestoreState,
  messageIds: string[],
): Promise<void> {
  if (state.isDisposed() || !messageIds.length) return;
  const token = state.getRestoreToken();
  const anchorsByMessage = collectRenderedMessageAnchors(messageIds);
  state.remountGroups(flattenMessageAnchors(anchorsByMessage));
  const records = await state.readRecords();
  if (!records || state.isDisposed() || token !== state.getRestoreToken()) return;
  restoreRenderedFavorites(state, records, anchorsByMessage);
}

/**
 * 收集本轮已渲染消息中的段落挂载锚点
 * @param messageIds 目标消息楼层 ID
 * @returns 按消息与段落索引分组的锚点
 */
function collectRenderedMessageAnchors(messageIds: string[]): Map<string, Map<number, InlineFavoriteAnchor>> {
  const targetIds = new Set(messageIds);
  const anchorsByMessage = new Map<string, Map<number, InlineFavoriteAnchor>>();
  getVisibleChatParagraphElements().forEach(paragraph => {
    const messageId = findMessageId(paragraph);
    if (!messageId || !targetIds.has(messageId)) return;
    const index = getGlobalParagraphIndex(paragraph);
    if (index >= 0) getMessageAnchorMap(anchorsByMessage, messageId).set(index, createInlineFavoriteAnchor(paragraph));
  });
  return anchorsByMessage;
}

/**
 * 读取或创建单条消息的锚点表
 * @param anchorsByMessage 全量消息锚点表
 * @param messageId 消息楼层 ID
 * @returns 单条消息锚点表
 */
function getMessageAnchorMap(
  anchorsByMessage: Map<string, Map<number, InlineFavoriteAnchor>>,
  messageId: string,
): Map<number, InlineFavoriteAnchor> {
  const existing = anchorsByMessage.get(messageId);
  if (existing) return existing;
  const anchors = new Map<number, InlineFavoriteAnchor>();
  anchorsByMessage.set(messageId, anchors);
  return anchors;
}

/**
 * 合并多条消息的锚点表
 * @param anchorsByMessage 按消息分组的锚点
 * @returns 按全局段落索引分组的锚点
 */
function flattenMessageAnchors(
  anchorsByMessage: Map<string, Map<number, InlineFavoriteAnchor>>,
): Map<number, InlineFavoriteAnchor> {
  const anchors = new Map<number, InlineFavoriteAnchor>();
  anchorsByMessage.forEach(messageAnchors => {
    messageAnchors.forEach((anchor, index) => anchors.set(index, anchor));
  });
  return anchors;
}

/**
 * 恢复消息渲染事件影响到的收藏图片
 * @param state 恢复状态
 * @param records 当前聊天收藏记录
 * @param anchorsByMessage 本轮消息锚点
 */
function restoreRenderedFavorites(
  state: InlineImageMessageRenderRestoreState,
  records: InlineImageFavoriteListItem[],
  anchorsByMessage: Map<string, Map<number, InlineFavoriteAnchor>>,
): void {
  anchorsByMessage.forEach((anchors, messageId) => {
    restoreRenderedMessageFavorites(state, messageId, records, anchors);
  });
}

/**
 * 恢复单条消息的收藏图片
 * @param state 恢复状态
 * @param messageId 消息楼层 ID
 * @param records 当前聊天收藏记录
 * @param anchors 当前消息的段落锚点
 */
function restoreRenderedMessageFavorites(
  state: InlineImageMessageRenderRestoreState,
  messageId: string,
  records: InlineImageFavoriteListItem[],
  anchors: Map<number, InlineFavoriteAnchor>,
): void {
  records.forEach(record => {
    const index = resolveRenderedFavoriteIndex(record, messageId, anchors);
    if (index === null) return;
    const anchor = anchors.get(index);
    if (anchor) state.mergeFavoriteRecords(index, anchor, [{ ...record, globalParagraphIndex: index }]);
  });
}

/**
 * 将收藏记录解析到当前消息内的段落索引
 * @param record 收藏记录
 * @param messageId 当前消息楼层 ID
 * @param anchors 当前消息的段落锚点
 * @returns 当前段落索引
 */
function resolveRenderedFavoriteIndex(
  record: InlineImageFavoriteListItem,
  messageId: string,
  anchors: Map<number, InlineFavoriteAnchor>,
): number | null {
  if (!isRecordForRenderedMessage(record, messageId, anchors)) return null;
  const hashIndex = findParagraphHashIndex(record.paragraphTextHash, anchors);
  if (hashIndex !== null) return hashIndex;
  return canUseGlobalParagraphFallback(record, messageId) && anchors.has(record.globalParagraphIndex)
    ? record.globalParagraphIndex
    : null;
}

/**
 * 判断收藏记录是否属于当前消息渲染事件
 * @param record 收藏记录
 * @param messageId 当前消息楼层 ID
 * @param anchors 当前消息的段落锚点
 * @returns 是否应恢复
 */
function isRecordForRenderedMessage(
  record: InlineImageFavoriteListItem,
  messageId: string,
  anchors: Map<number, InlineFavoriteAnchor>,
): boolean {
  if (record.mesId && record.mesId !== messageId) return false;
  if (hasStoredSwipeId(record) && !isRecordSwipeVisible(record, messageId)) return false;
  if (record.mesId) return true;
  return anchors.has(record.globalParagraphIndex);
}

/**
 * 判断收藏记录是否保存了明确的 swipe 版本
 * @param record 收藏记录
 * @returns 是否带有 swipeId
 */
function hasStoredSwipeId(record: InlineImageFavoriteListItem): boolean {
  return typeof record.swipeId === 'number';
}

/**
 * 判断收藏记录是否属于当前消息的可见 swipe
 * @param record 收藏记录
 * @param messageId 当前消息楼层 ID
 * @returns 是否属于当前 swipe
 */
function isRecordSwipeVisible(record: InlineImageFavoriteListItem, messageId: string): boolean {
  const currentSwipeId = getMessageSwipeId(messageId);
  if (hasStoredSwipeId(record)) return currentSwipeId === record.swipeId;
  return currentSwipeId === null || currentSwipeId === 0;
}

/**
 * 判断收藏记录能否退回全局段落索引定位
 * @param record 收藏记录
 * @param messageId 当前消息楼层 ID
 * @returns 是否允许使用索引兜底
 */
function canUseGlobalParagraphFallback(record: InlineImageFavoriteListItem, messageId: string): boolean {
  return isRecordSwipeVisible(record, messageId);
}

/**
 * 按段落文本 hash 查找当前段落索引
 * @param paragraphTextHash 收藏记录中的段落文本 hash
 * @param anchors 当前消息的段落锚点
 * @returns 命中的当前段落索引
 */
function findParagraphHashIndex(
  paragraphTextHash: string | undefined,
  anchors: Map<number, InlineFavoriteAnchor>,
): number | null {
  if (!paragraphTextHash) return null;
  for (const [index, anchor] of anchors) {
    if (anchor.paragraph && getParagraphTextHash(anchor.paragraph) === paragraphTextHash) return index;
  }
  return null;
}
