import type { InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import {
  deleteFavoriteGalleryItem,
  favoriteGalleryItem,
  unfavoriteGalleryItem,
} from '@/composables/inlineImageGalleryFavorite';
import {
  deletePersistedSessionItem,
  listSlotSessionItems,
  patchSessionItem,
  persistExistingSessionItem,
  removeSessionItem,
  appendGeneratedSessionItem,
  type GallerySessionItem,
} from '@/composables/inlineGallerySession';
import {
  listInlineImageFavoritesBySlot,
  type InlineImageFavoriteListItem,
} from '@/services/inline-image/favorites-cache';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import { removeSlotShortcodeFromMessage } from '@/services/inline-image/slot-bind';
import { deleteFloorTailSlot } from '@/services/inline-image/floor-tail-slot';
import type { GalleryMountRuntime } from '@/store/gallery-runtimes';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { useSettingsStore } from '@/store/settings';
import type { InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';

/**
 * 把会话临时项转换为画廊显示项
 * @param sessionItem 会话项
 * @param objectUrls URL 集合
 * @returns 画廊项
 */
export function sessionItemToGalleryItem(
  sessionItem: GallerySessionItem,
  objectUrls: Set<string>,
): InlineGalleryItem {
  return {
    id: sessionItem.id,
    favoriteId: sessionItem.favoriteId,
    blobUrl: createTrackedObjectUrl(sessionItem.imageBlob, objectUrls),
    imageBlob: sessionItem.imageBlob,
    promptSnapshot: sessionItem.promptSnapshot,
    createdAt: sessionItem.createdAt,
  };
}

/**
 * 解析 mount 的画廊项列表（本地文件收藏 + 会话临时覆盖层）
 * @param mount 运行时 mount
 * @param objectUrls 由调用方持有的 URL 集合，便于卸载释放
 * @returns 画廊项
 */
export async function loadMountGalleryItems(
  mount: GalleryMountRuntime,
  objectUrls: Set<string>,
): Promise<InlineGalleryItem[]> {
  return loadSlotMountItems(mount.mountKey.slotId, objectUrls);
}

/**
 * 切换收藏：临时→slot 时 rekey 容器与 session
 * @param mount 运行时
 * @param item 画廊项
 * @param items 当前完整 items 引用（供 favorite host）
 */
export async function toggleMountFavorite(
  mount: GalleryMountRuntime,
  item: InlineGalleryItem,
  items: InlineGalleryItem[],
): Promise<void> {
  const host = buildFavoriteHost(mount, items);
  if (typeof item.favoriteId === 'number') {
    const favoriteId = item.favoriteId;
    const staged = await stageUnfavoriteSessionItem(mount, item, favoriteId);
    try {
      await unfavoriteGalleryItem(host, item);
      await finalizeUnfavoriteSessionItem(staged.key, staged.itemId);
    } catch (error) {
      item.favoriteId = favoriteId;
      patchSessionItem(staged.key, staged.itemId, { favoriteId });
      throw error;
    }
    toastr.success('已取消收藏');
    return;
  }
  await favoriteMountItem(mount, item, host);
}

/**
 * 收藏成功后写回 slot 会话
 * @param mount 运行时
 * @param item 画廊项
 * @param host favorite host
 */
async function favoriteMountItem(
  mount: GalleryMountRuntime,
  item: InlineGalleryItem,
  host: {
    slotId: string | null;
    anchor: InlineFavoriteAnchor;
    items: InlineGalleryItem[];
  },
): Promise<void> {
  const bound = await favoriteGalleryItem(host, item, () => undefined);
  if (bound) toastr.success('已收藏图片，将存储于 SillyTavern 本地文件');
  patchSessionItem(mount.key, item.id, {
    favoriteId: item.favoriteId,
    createdAt: item.createdAt,
  });
  await deletePersistedSessionItem(item.id);
}

/**
 * 取消收藏前把图片暂存到会话层
 * @param mount 运行时
 * @param item 画廊项
 * @param favoriteId 取消前的收藏记录 id
 * @returns 暂存会话位置
 */
async function stageUnfavoriteSessionItem(
  mount: GalleryMountRuntime,
  item: InlineGalleryItem,
  favoriteId: number,
): Promise<{ key: string; itemId: string }> {
  const existing = findPreviousSessionItem(mount, favoriteId);
  if (existing) {
    patchSessionItem(mount.key, existing.id, { favoriteId, createdAt: Date.now() });
    await persistUnfavoritedSessionItem(mount.key, existing.id);
    return { key: mount.key, itemId: existing.id };
  }
  const sessionItem = createUnfavoritedSessionItem(item, mount.mountKey.slotId, favoriteId);
  const session = appendGeneratedSessionItem(mount.mountKey.slotId, sessionItem);
  await persistUnfavoritedSessionItem(session.key, sessionItem.id);
  return { key: session.key, itemId: sessionItem.id };
}

/**
 * 把暂存项切换为未收藏
 * @param key 会话键
 * @param itemId 图片 ID
 */
async function finalizeUnfavoriteSessionItem(key: string, itemId: string): Promise<void> {
  patchSessionItem(key, itemId, { favoriteId: null });
  await persistUnfavoritedSessionItem(key, itemId);
}

/**
 * 查找收藏前保留的临时会话项
 * @param mount 运行时
 * @param favoriteId 收藏 ID
 * @returns 会话项或 undefined
 */
function findPreviousSessionItem(mount: GalleryMountRuntime, favoriteId: number): GallerySessionItem | undefined {
  return listSlotSessionItems(mount.mountKey.slotId)
    .find(candidate => candidate.favoriteId === favoriteId);
}

/**
 * 创建取消收藏后的临时会话项
 * @param item 画廊项
 * @param slotId 短码位点
 * @param favoriteId 取消前的收藏记录 id
 * @returns 临时会话项
 */
function createUnfavoritedSessionItem(item: InlineGalleryItem, slotId: string, favoriteId: number): GallerySessionItem {
  return {
    id: item.id,
    favoriteId,
    slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: item.promptSnapshot,
    createdAt: Date.now(),
  };
}

/**
 * 将取消收藏后的图片重新写入临时存储
 * @param key 会话键
 * @param itemId 图片 ID
 */
async function persistUnfavoritedSessionItem(key: string, itemId: string): Promise<void> {
  const scope = getCurrentInlineFavoriteScope();
  if (!scope) throw new Error('当前角色或聊天未就绪，无法保存临时图片');
  const limit = useSettingsStore().savedSettings.temporaryImageLimit;
  const persisted = await persistExistingSessionItem(key, itemId, scope, limit);
  if (!persisted) throw new Error('临时图片已被数量限制清理，请重试取消收藏');
}

/**
 * 移除画廊项（收藏删除本地文件；临时删除浏览器记录）
 * @param mount 运行时
 * @param item 项
 * @param items 当前 items
 * @returns 是否还有剩余项
 */
export async function removeMountItem(
  mount: GalleryMountRuntime,
  item: InlineGalleryItem,
  items: InlineGalleryItem[],
): Promise<boolean> {
  const host = buildFavoriteHost(mount, items);
  if (item.favoriteId) await deleteFavoriteGalleryItem(host, item);
  const remaining = items.filter(candidate => candidate.id !== item.id);
  await removeSessionItem(mount.key, item.id);
  if (!remaining.length) {
    const target = mount.anchor.paragraph ?? mount.messageId;
    await removeSlotShortcodeFromMessage(target, mount.mountKey.slotId);
    // 前端型楼层尾 slot 才需要清 chatMetadata；classic-p slotId 不在 floor-tail slots 里
    if (!mount.anchor.paragraph) deleteFloorTailSlot(mount.mountKey.slotId);
    useGalleryRuntimesStore().removeMount(mount.key, mount.messageId);
    return false;
  }
  return true;
}

/**
 * 读取 regenerate / download 回调
 * 前端型楼层尾 mount（paragraph 为 null）用 anchor.target 作为生图锚点
 * @param mount 运行时
 * @param item 项
 */
export function invokeGenerateLast(mount: GalleryMountRuntime, item: InlineGalleryItem): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const anchor = mount.anchor.paragraph ?? mount.anchor.target;
  if (!handlers || !anchor) return;
  void handlers.onGenerateWithSnapshot(anchor, item.promptSnapshot);
}

/**
 * 重新生成 TAG + 图
 * @param mount 运行时
 */
export function invokeGenerateFresh(mount: GalleryMountRuntime): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const anchor = mount.anchor.paragraph ?? mount.anchor.target;
  if (!handlers || !anchor) return;
  void handlers.onGenerateWithFreshPrompt(anchor, 'repeat');
}

/**
 * 编辑 TAG 后生图
 * 前端型楼层尾 mount 用 anchor.target 作为生图锚点
 * @param mount 运行时
 * @param item 项
 */
export function invokeGenerateEditable(mount: GalleryMountRuntime, item: InlineGalleryItem): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const anchor = mount.anchor.paragraph ?? mount.anchor.target;
  if (!handlers || !anchor) return;
  void handlers.onGenerateWithEditablePrompt(anchor, item.promptSnapshot);
}

/**
 * 下载图片
 * @param item 项
 */
export function invokeDownload(item: InlineGalleryItem): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  if (!handlers) return;
  void handlers.onDownloadImage(item.imageBlob, item.createdAt);
}

/**
 * 创建 Object URL 并登记
 * @param blob 图片
 * @param objectUrls 集合
 * @returns URL
 */
export function createTrackedObjectUrl(blob: Blob, objectUrls: Set<string>): string {
  const url = URL.createObjectURL(blob);
  objectUrls.add(url);
  return url;
}

/**
 * 释放集合中全部 Object URL
 * @param objectUrls 集合
 */
export function revokeTrackedObjectUrls(objectUrls: Set<string>): void {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

/**
 * 从 IndexedDB 会话读取当前 slot 的临时图片项
 * @param slotId 短码 ID
 * @param objectUrls URL 集合
 * @returns 会话画廊项列表
 */
function loadSlotMountSessionItems(slotId: string, objectUrls: Set<string>): InlineGalleryItem[] {
  return listSlotSessionItems(slotId).map(item => sessionItemToGalleryItem(item, objectUrls));
}

/**
 * 读取 slot 绑定的收藏图片并组装画廊项
 * @param slotId 短码位点 ID
 * @param objectUrls 由调用方持有的 URL 集合
 * @returns 收藏画廊项列表
 */
async function loadSlotMountFavoriteItems(
  slotId: string,
  objectUrls: Set<string>,
): Promise<InlineGalleryItem[]> {
  const scope = getCurrentInlineFavoriteScope();
  if (!scope) return [];
  const favorites = await listInlineImageFavoritesBySlot(scope, slotId);
  return favorites.map(favorite => ({
    id: `fav-${favorite.id}`,
    favoriteId: favorite.id,
    blobUrl: createTrackedObjectUrl(favorite.imageBlob, objectUrls),
    imageBlob: favorite.imageBlob,
    promptSnapshot: favorite.promptSnapshot,
    createdAt: favorite.createdAt,
  }));
}

/**
 * 合并 slot 下的收藏图片与临时会话图片（收藏排在前，临时排在后）
 * @param slotId 短码位点 ID
 * @param objectUrls URL 集合
 * @returns 完整画廊项列表
 */
async function loadSlotMountItems(
  slotId: string,
  objectUrls: Set<string>,
): Promise<InlineGalleryItem[]> {
  const favorites = await loadSlotMountFavoriteItems(slotId, objectUrls);
  const favoriteIds = new Set(favorites.map(f => f.favoriteId));
  const sessionItems = loadSlotMountSessionItems(slotId, objectUrls)
    .filter(item => typeof item.favoriteId !== 'number' || !favoriteIds.has(item.favoriteId));
  return [...favorites, ...sessionItems];
}

/**
 * 组装收藏宿主对象
 * @param mount 运行时 mount
 * @param items 当前画廊项列表
 * @returns 收藏宿主
 */
function buildFavoriteHost(
  mount: GalleryMountRuntime,
  items: InlineGalleryItem[],
): {
  slotId: string | null;
  anchor: InlineFavoriteAnchor;
  items: InlineGalleryItem[];
} {
  return {
    slotId: mount.mountKey.slotId,
    anchor: mount.anchor,
    items,
  };
}
