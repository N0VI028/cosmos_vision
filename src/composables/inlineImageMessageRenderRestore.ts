import { type SlotGalleryMountSpec } from '@/services/inline-image/slot-gallery-restore';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  getGlobalParagraphIndex,
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
  remountGroups: (anchors: Map<number, InlineFavoriteAnchor>) => void;
  readMessageSlotMounts: (messageIds: string[]) => Promise<SlotGalleryMountSpec[]>;
  restoreBySlotMounts: (mounts: SlotGalleryMountSpec[]) => void;
}

interface InlineImageMessageRenderRestoreState extends InlineImageMessageRenderRestoreOptions {
  timer: number | null;
  pendingMessageIds: Set<string>;
  schedule: (messageId: unknown) => void;
}

/**
 * 创建 ST 单条消息渲染后的段落图片恢复器（按 slot 短码）
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
 * 恢复指定消息楼层内的段落图片（扫短码 → listBySlot）
 * @param state 恢复状态
 * @param messageIds 消息楼层 ID 列表
 */
async function restoreRenderedMessages(
  state: InlineImageMessageRenderRestoreState,
  messageIds: string[],
): Promise<void> {
  if (state.isDisposed() || !messageIds.length) return;
  const token = state.getRestoreToken();
  const anchors = collectRenderedMessageAnchors(messageIds);
  state.remountGroups(anchors);
  const mounts = await safeReadMessageSlotMounts(state, messageIds);
  if (state.isDisposed() || token !== state.getRestoreToken()) return;
  state.restoreBySlotMounts(mounts);
}

/**
 * 安全读取消息内 slot 挂载规格
 * @param state 恢复状态
 * @param messageIds 消息 id
 * @returns 挂载规格
 */
async function safeReadMessageSlotMounts(
  state: InlineImageMessageRenderRestoreState,
  messageIds: string[],
): Promise<SlotGalleryMountSpec[]> {
  try {
    return await state.readMessageSlotMounts(messageIds);
  } catch (error) {
    console.error('[CosmosVision] 按短码恢复段落图片失败', error);
    return [];
  }
}

/**
 * 收集本轮已渲染消息中的段落挂载锚点
 * @param messageIds 目标消息楼层 ID
 * @returns index → anchor
 */
function collectRenderedMessageAnchors(messageIds: string[]): Map<number, InlineFavoriteAnchor> {
  const targetIds = new Set(messageIds);
  const anchors = new Map<number, InlineFavoriteAnchor>();
  getVisibleChatParagraphElements().forEach(paragraph => {
    const messageId = findMessageId(paragraph);
    if (!messageId || !targetIds.has(messageId)) return;
    const index = getGlobalParagraphIndex(paragraph);
    if (index >= 0) anchors.set(index, createInlineFavoriteAnchor(paragraph));
  });
  return anchors;
}
