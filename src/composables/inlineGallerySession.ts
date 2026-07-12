import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  getParagraphTextHash,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';
import { CV_SLOT_ATTR, findRenderContainerAfter } from '@/services/inline-image/cv-render-container';
import { resolveParagraphSlotId } from '@/services/inline-image/slot-bind';

/** 会话临时画廊项（未写 raw / 默认可丢） */
export interface GallerySessionItem {
  id: string;
  favoriteId: number | null;
  slotId: string | null;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

/** 会话画廊记录：与 DOM 解耦，供消息重绘 rehydrate */
export interface GallerySessionRecord {
  key: string;
  kind: 'temp' | 'slot';
  tempId?: string;
  slotId?: string;
  messageId: number;
  paragraphHash: string;
  items: GallerySessionItem[];
}

const sessions = new Map<string, GallerySessionRecord>();
let nextTempSeq = 1;

/**
 * 追加临时生图项到会话；有 slot 时挂在 slot 覆盖层，否则新建 temp 键
 * @param paragraph 宿主段落
 * @param item 临时项（不含 objectUrl）
 * @returns 会话记录
 */
export function appendGeneratedSessionItem(
  paragraph: HTMLElement,
  item: GallerySessionItem,
): GallerySessionRecord {
  const messageId = Number(findMessageId(paragraph) ?? NaN);
  if (!Number.isFinite(messageId)) throw new Error('未找到消息楼层，无法挂载临时画廊');
  const paragraphHash = getParagraphTextHash(paragraph);
  const existingSlot = item.slotId ?? resolveSessionSlotOnParagraph(paragraph);
  if (existingSlot) return appendToSlotSession(existingSlot, messageId, paragraphHash, item);
  return appendToTempSession(messageId, paragraphHash, item);
}

/**
 * 列出某楼层下全部存活会话画廊
 * @param messageId 楼层 id
 * @returns 会话记录
 */
export function listSessionsByMessage(messageId: number): GallerySessionRecord[] {
  return [...sessions.values()].filter(record => record.messageId === messageId);
}

/**
 * 按 key 读取会话
 * @param key `temp:…` 或 `slot:…`
 * @returns 记录或 null
 */
export function getSessionByKey(key: string): GallerySessionRecord | null {
  return sessions.get(key) ?? null;
}

/**
 * 读取 slot 会话覆盖层项
 * @param slotId 位点 id
 * @returns 临时/待收藏项
 */
export function listSlotSessionItems(slotId: string): GallerySessionItem[] {
  return sessions.get(buildSlotSessionKey(slotId))?.items ?? [];
}

/**
 * 读取 temp 会话项
 * @param tempId 临时 id
 * @returns 项列表
 */
export function listTempSessionItems(tempId: string): GallerySessionItem[] {
  return sessions.get(buildTempSessionKey(tempId))?.items ?? [];
}

/**
 * 临时键晋升为 slot 键（收藏升级）
 * @param tempId 临时 id
 * @param slotId 位点 id
 * @returns 晋升后的记录
 */
export function rekeyTempSessionToSlot(tempId: string, slotId: string): GallerySessionRecord | null {
  const tempKey = buildTempSessionKey(tempId);
  const record = sessions.get(tempKey);
  if (!record) return null;
  sessions.delete(tempKey);
  const slotKey = buildSlotSessionKey(slotId);
  const existing = sessions.get(slotKey);
  if (existing) {
    existing.items = sortSessionItems([...record.items, ...existing.items]);
    existing.items.forEach(item => {
      item.slotId = slotId;
    });
    return existing;
  }
  record.key = slotKey;
  record.kind = 'slot';
  record.slotId = slotId;
  delete record.tempId;
  record.items.forEach(item => {
    item.slotId = slotId;
  });
  sessions.set(slotKey, record);
  return record;
}

/**
 * 从会话移除单项
 * @param key 画廊 key
 * @param itemId 项 id
 * @returns 剩余项数
 */
export function removeSessionItem(key: string, itemId: string): number {
  const record = sessions.get(key);
  if (!record) return 0;
  record.items = record.items.filter(item => item.id !== itemId);
  if (!record.items.length) sessions.delete(key);
  return record.items.length;
}

/**
 * 更新会话内的项（收藏 id / slot）
 * @param key 画廊 key
 * @param itemId 项 id
 * @param patch 补丁
 */
export function patchSessionItem(
  key: string,
  itemId: string,
  patch: Partial<Pick<GallerySessionItem, 'favoriteId' | 'slotId' | 'createdAt'>>,
): void {
  const item = sessions.get(key)?.items.find(candidate => candidate.id === itemId);
  if (item) Object.assign(item, patch);
}

/**
 * 换聊天或卸载时清空全部会话临时图
 */
export function clearAllGallerySessions(): void {
  sessions.clear();
}

/**
 * 用 mesId + 段落 hash 重定位宿主段落
 * @param messageId 楼层 id
 * @param paragraphHash 正文 hash
 * @returns 段落或 null
 */
export function findParagraphBySessionHash(
  messageId: number,
  paragraphHash: string,
): HTMLElement | null {
  const mes = document.querySelector(`#chat > .mes[mesid="${messageId}"]`);
  if (!(mes instanceof HTMLElement)) return null;
  const paragraphs = Array.from(mes.querySelectorAll('.mes_text p')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
  return paragraphs.find(paragraph => getParagraphTextHash(paragraph) === paragraphHash) ?? null;
}

/**
 * 读取会话对应锚点（找不到段落则放弃）
 * @param record 会话记录
 * @returns 锚点或 null
 */
export function resolveSessionAnchor(record: GallerySessionRecord): InlineFavoriteAnchor | null {
  const paragraph = findParagraphBySessionHash(record.messageId, record.paragraphHash);
  return paragraph ? createInlineFavoriteAnchor(paragraph) : null;
}

/**
 * 构建 slot 会话 key
 * @param slotId 位点 id
 * @returns key
 */
export function buildSlotSessionKey(slotId: string): string {
  return `slot:${slotId}`;
}

/**
 * 构建 temp 会话 key
 * @param tempId 临时 id
 * @returns key
 */
export function buildTempSessionKey(tempId: string): string {
  return `temp:${tempId}`;
}

/**
 * 生成新的临时 id
 * @returns tempId
 */
export function createTempId(): string {
  return `t-${nextTempSeq++}`;
}

/**
 * 生成临时项 id
 * @returns item id
 */
export function createSessionItemId(): string {
  return `temporary-${nextTempSeq++}`;
}

/**
 * 解析段落已有 slot：容器 data 优先，其次短码/raw
 * @param paragraph 段落
 * @returns slotId 或 null
 */
function resolveSessionSlotOnParagraph(paragraph: HTMLElement): string | null {
  const container = findRenderContainerAfter(paragraph);
  const fromDom = container?.getAttribute(CV_SLOT_ATTR);
  if (fromDom) return fromDom;
  return resolveParagraphSlotId(paragraph);
}

/**
 * 追加到 slot 会话覆盖层
 * @param slotId 位点 id
 * @param messageId 楼层
 * @param paragraphHash 段 hash
 * @param item 项
 * @returns 记录
 */
function appendToSlotSession(
  slotId: string,
  messageId: number,
  paragraphHash: string,
  item: GallerySessionItem,
): GallerySessionRecord {
  const key = buildSlotSessionKey(slotId);
  const existing = sessions.get(key);
  item.slotId = slotId;
  if (existing) {
    existing.items = sortSessionItems([item, ...existing.items]);
    existing.messageId = messageId;
    existing.paragraphHash = paragraphHash;
    return existing;
  }
  const record: GallerySessionRecord = {
    key,
    kind: 'slot',
    slotId,
    messageId,
    paragraphHash,
    items: [item],
  };
  sessions.set(key, record);
  return record;
}

/**
 * 追加到纯临时会话；同段落 hash 复用既有 temp 记录
 * @param messageId 楼层
 * @param paragraphHash 段 hash
 * @param item 项
 * @returns 记录
 */
function appendToTempSession(
  messageId: number,
  paragraphHash: string,
  item: GallerySessionItem,
): GallerySessionRecord {
  const existing = findTempSession(messageId, paragraphHash);
  item.slotId = null;
  if (existing) {
    existing.items = sortSessionItems([item, ...existing.items]);
    return existing;
  }
  const tempId = createTempId();
  const key = buildTempSessionKey(tempId);
  const record: GallerySessionRecord = {
    key,
    kind: 'temp',
    tempId,
    messageId,
    paragraphHash,
    items: [item],
  };
  sessions.set(key, record);
  return record;
}

/**
 * 查找同楼同段落的临时会话
 * @param messageId 楼层
 * @param paragraphHash 段 hash
 * @returns 记录或 null
 */
function findTempSession(messageId: number, paragraphHash: string): GallerySessionRecord | null {
  for (const record of sessions.values()) {
    if (record.kind !== 'temp') continue;
    if (record.messageId === messageId && record.paragraphHash === paragraphHash) return record;
  }
  return null;
}

/**
 * 按创建时间从新到旧排序
 * @param items 项
 * @returns 排序后的项
 */
function sortSessionItems(items: GallerySessionItem[]): GallerySessionItem[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}
