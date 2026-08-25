import { cloneInlinePromptSnapshot, type InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { uuidv4 } from '@sillytavern/scripts/utils';
import type { InlineImageFavoriteScope } from '@/services/inline-image/favorites-cache';
import {
  deleteTemporaryImage,
  listTemporaryImages,
  saveTemporaryImage,
  type TemporaryImageRecord,
} from '@/services/inline-image/temporary-images';

/** 会话临时画廊项：与消息短码共用同一 slotId */
export interface GallerySessionItem {
  id: string;
  favoriteId: number | null;
  slotId: string;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

/** slot 画廊会话：仅存位点与未收藏图片 */
export interface GallerySessionRecord {
  key: string;
  slotId: string;
  items: GallerySessionItem[];
}

const sessions = new Map<string, GallerySessionRecord>();
let sessionMutationQueue = Promise.resolve();

/**
 * 追加临时生图项到指定短码位点
 * @param slotId 消息短码位点
 * @param item 临时项（不含 objectUrl）
 * @returns 会话记录
 */
export function appendGeneratedSessionItem(slotId: string, item: GallerySessionItem): GallerySessionRecord {
  item.slotId = slotId;
  return appendToSlotSession(slotId, item);
}

/**
 * 持久化会话中的临时图片
 * @param record 会话记录
 * @param item 临时图片项
 * @param scope 角色与聊天作用域
 * @param limit 最大保存数量
 * @returns 被淘汰的图片 ID
 */
export async function persistGallerySessionItem(
  record: GallerySessionRecord,
  item: GallerySessionItem,
  scope: InlineImageFavoriteScope,
  limit: number,
): Promise<string[]> {
  const removedIds = await saveTemporaryImage(toTemporaryImageRecord(record, item, scope), limit);
  removeSessionItemsByIds(removedIds);
  return removedIds;
}

/**
 * 从 IndexedDB 恢复当前作用域临时画廊
 * @param scope 角色与聊天作用域
 */
export async function restoreGallerySessions(scope: InlineImageFavoriteScope): Promise<void> {
  await enqueueSessionMutation(async () => {
    sessions.clear();
    const records = await listTemporaryImages(scope);
    records.sort((left, right) => right.createdAt - left.createdAt).forEach(restoreTemporaryImageRecord);
  });
}

/**
 * 重新持久化指定会话项
 * @param key 会话键
 * @param itemId 图片 ID
 * @param scope 角色与聊天作用域
 * @param limit 最大保存数量
 * @returns 持久化后是否仍保留该图片
 */
export async function persistExistingSessionItem(
  key: string,
  itemId: string,
  scope: InlineImageFavoriteScope,
  limit: number,
): Promise<boolean> {
  const record = sessions.get(key);
  const item = record?.items.find(candidate => candidate.id === itemId);
  if (!record || !item) return false;
  await persistGallerySessionItem(record, item, scope, limit);
  return Boolean(sessions.get(key)?.items.some(candidate => candidate.id === itemId));
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
 * 从会话移除单项
 * @param key 画廊 key
 * @param itemId 图片 ID
 * @returns 剩余项数
 */
export async function removeSessionItem(key: string, itemId: string): Promise<number> {
  return enqueueSessionMutation(async () => {
    const record = sessions.get(key);
    await deleteTemporaryImage(itemId);
    if (!record) return 0;
    record.items = record.items.filter(item => item.id !== itemId);
    if (!record.items.length) sessions.delete(key);
    return record.items.length;
  });
}

/**
 * 更新会话内的收藏状态
 * @param key 画廊 key
 * @param itemId 图片 ID
 * @param patch 补丁
 */
export function patchSessionItem(
  key: string,
  itemId: string,
  patch: Partial<Pick<GallerySessionItem, 'favoriteId' | 'createdAt'>>,
): void {
  const item = sessions.get(key)?.items.find(candidate => candidate.id === itemId);
  if (item) Object.assign(item, patch);
}

/**
 * 删除已持久化的临时会话项
 * @param itemId 图片 ID
 */
export async function deletePersistedSessionItem(itemId: string): Promise<void> {
  await deleteTemporaryImage(itemId);
}

/** 清空全部会话临时图 */
export function clearAllGallerySessions(): void {
  sessions.clear();
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
 * 生成临时项 id
 * @returns item id
 */
export function createSessionItemId(): string {
  return `temporary-${uuidv4()}`;
}

/**
 * 追加到 slot 会话覆盖层
 * @param slotId 位点 id
 * @param item 项
 * @returns 会话记录
 */
function appendToSlotSession(slotId: string, item: GallerySessionItem): GallerySessionRecord {
  const key = buildSlotSessionKey(slotId);
  const existing = sessions.get(key);
  if (existing) {
    existing.items = sortSessionItems([item, ...existing.items]);
    return existing;
  }
  const record = { key, slotId, items: [item] };
  sessions.set(key, record);
  return record;
}

/**
 * 按创建时间从新到旧排序
 * @param items 项
 * @returns 排序后的项
 */
function sortSessionItems(items: GallerySessionItem[]): GallerySessionItem[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 将会话项转换为临时图片记录
 * @param record 会话记录
 * @param item 会话图片
 * @param scope 角色与聊天作用域
 * @returns 临时图片记录
 */
function toTemporaryImageRecord(
  record: GallerySessionRecord,
  item: GallerySessionItem,
  scope: InlineImageFavoriteScope,
): TemporaryImageRecord {
  return {
    ...scope,
    id: item.id,
    slotId: record.slotId,
    favoriteId: item.favoriteId,
    imageBlob: item.imageBlob,
    // IndexedDB structured clone 无法序列化 Vue Proxy，必须落纯对象
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  };
}

/**
 * 恢复单条临时图片记录
 * @param record 临时图片记录
 */
function restoreTemporaryImageRecord(record: TemporaryImageRecord): void {
  if (!record.slotId) {
    return;
  }
  appendToSlotSession(record.slotId, {
    id: record.id,
    favoriteId: record.favoriteId ?? null,
    slotId: record.slotId,
    imageBlob: record.imageBlob,
    promptSnapshot: record.promptSnapshot,
    createdAt: record.createdAt,
  });
}

/**
 * 从内存会话移除已淘汰图片
 * @param ids 图片 ID
 */
export function removeSessionItemsByIds(ids: string[]): void {
  if (!ids.length) return;
  const removed = new Set(ids);
  sessions.forEach((record, key) => {
    record.items = record.items.filter(item => !removed.has(item.id));
    if (!record.items.length) sessions.delete(key);
  });
}

/**
 * 串行执行会话恢复与删除
 * @param task 会话操作
 * @returns 会话操作结果
 */
function enqueueSessionMutation<T>(task: () => Promise<T>): Promise<T> {
  const run = sessionMutationQueue.then(task, task);
  sessionMutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
