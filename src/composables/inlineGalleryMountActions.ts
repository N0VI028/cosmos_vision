import type { InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import {
  deleteFavoriteGalleryItem,
  favoriteGalleryItem,
  unfavoriteGalleryItem,
} from '@/composables/inlineImageGalleryFavorite';
import {
  buildSlotSessionKey,
  listSlotSessionItems,
  listTempSessionItems,
  patchSessionItem,
  rekeyTempSessionToSlot,
  removeSessionItem,
  appendGeneratedSessionItem,
  type GallerySessionItem,
} from '@/composables/inlineGallerySession';
import {
  listInlineImageFavoritesBySlot,
  type InlineImageFavoriteListItem,
} from '@/services/inline-image/favorites-cache';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import {
  rekeyRenderContainerToSlot,
} from '@/services/inline-image/cv-render-container';
import type { GalleryMountRuntime } from '@/store/gallery-runtimes';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import type { InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';

/**
 * 解析 mount 的画廊项列表（IDB favorites + 会话临时覆盖层）
 * @param mount 运行时 mount
 * @param objectUrls 由调用方持有的 URL 集合，便于卸载释放
 * @returns 画廊项
 */
export async function loadMountGalleryItems(
  mount: GalleryMountRuntime,
  objectUrls: Set<string>,
): Promise<InlineGalleryItem[]> {
  if (mount.mountKey.kind === 'slot') {
    return loadSlotMountItems(mount.mountKey.slotId, objectUrls);
  }
  return loadTempMountItems(mount.mountKey.tempId, objectUrls);
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
    await unfavoriteGalleryItem(host, item);
    ensureUnfavoritedItemInSession(mount, item);
    toastr.success('已取消收藏');
    return;
  }
  await favoriteAndUpgradeMount(mount, item, host);
}

/**
 * 收藏成功后写回 session，并在 temp→slot 时延后 audit（避免旧 key patch 竞态出双图）
 * @param mount 运行时
 * @param item 画廊项
 * @param host favorite host
 */
async function favoriteAndUpgradeMount(
  mount: GalleryMountRuntime,
  item: InlineGalleryItem,
  host: {
    slotId: string | null;
    anchor: InlineFavoriteAnchor;
    items: InlineGalleryItem[];
  },
): Promise<void> {
  let upgradedSlotId: string | null = null;
  const bound = await favoriteGalleryItem(host, item, slotId => {
    upgradedSlotId = slotId;
    rekeyRenderContainerToSlot(mount.element, slotId);
    if (mount.mountKey.kind === 'temp') {
      rekeyTempSessionToSlot(mount.mountKey.tempId, slotId);
    }
  });
  if (bound) toastr.success('已收藏图片，将长期存储');
  const sessionKey = upgradedSlotId ? buildSlotSessionKey(upgradedSlotId) : mount.key;
  patchSessionItem(sessionKey, item.id, {
    favoriteId: item.favoriteId,
    slotId: item.slotId,
    createdAt: item.createdAt,
  });
  if (upgradedSlotId) void useGalleryRuntimesStore().auditFloor(mount.messageId);
}

/**
 * 取消收藏后把图保留在会话层，避免 reload 后消失
 * @param mount 运行时
 * @param item 画廊项
 */
function ensureUnfavoritedItemInSession(mount: GalleryMountRuntime, item: InlineGalleryItem): void {
  item.favoriteId = null;
  const paragraph = mount.anchor.paragraph;
  if (!paragraph) {
    patchSessionItem(mount.key, item.id, { favoriteId: null });
    return;
  }
  const sessionItem: GallerySessionItem = {
    id: item.id,
    favoriteId: null,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: item.promptSnapshot,
    createdAt: item.createdAt,
  };
  // 若会话尚无此项，通过 append 挂回（同 slot 会并入 slot 覆盖层）
  const existing =
    mount.mountKey.kind === 'slot'
      ? listSlotSessionItems(mount.mountKey.slotId).some(candidate => candidate.id === item.id)
      : listTempSessionItems(mount.mountKey.tempId).some(candidate => candidate.id === item.id);
  if (existing) {
    patchSessionItem(mount.key, item.id, { favoriteId: null });
    return;
  }
  appendGeneratedSessionItem(paragraph, sessionItem);
}

/**
 * 移除画廊项（收藏删 IDB；临时仅会话）
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
  removeSessionItem(mount.key, item.id);
  if (!remaining.length) {
    useGalleryRuntimesStore().removeMount(mount.key, mount.messageId);
    return false;
  }
  return true;
}

/**
 * 读取 regenerate / download 回调
 * @param mount 运行时
 * @param item 项
 */
export function invokeGenerateLast(mount: GalleryMountRuntime, item: InlineGalleryItem): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const paragraph = mount.anchor.paragraph;
  if (!handlers || !paragraph) return;
  void handlers.onGenerateWithSnapshot(paragraph, item.promptSnapshot);
}

/**
 * 重新生成 TAG + 图
 * @param mount 运行时
 */
export function invokeGenerateFresh(mount: GalleryMountRuntime): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const paragraph = mount.anchor.paragraph;
  if (!handlers || !paragraph) return;
  void handlers.onGenerateWithFreshPrompt(paragraph);
}

/**
 * 编辑 TAG 后生图
 * @param mount 运行时
 * @param item 项
 */
export function invokeGenerateEditable(mount: GalleryMountRuntime, item: InlineGalleryItem): void {
  const handlers = useGalleryRuntimesStore().getActionHandlers();
  const paragraph = mount.anchor.paragraph;
  if (!handlers || !paragraph) return;
  void handlers.onGenerateWithEditablePrompt(paragraph, item.promptSnapshot);
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
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

/**
 * 加载 slot 画廊：IDB + 会话未收藏覆盖
 * @param slotId 位点
 * @param objectUrls URL 集合
 * @returns items
 */
async function loadSlotMountItems(
  slotId: string,
  objectUrls: Set<string>,
): Promise<InlineGalleryItem[]> {
  const favorites = await listInlineImageFavoritesBySlot(slotId, getCurrentInlineFavoriteScope());
  const favoriteItems = favorites.map(record => createFavoriteItem(record, slotId, objectUrls));
  const sessionItems = listSlotSessionItems(slotId)
    .filter(item => !favorites.some(record => record.id === item.favoriteId))
    .map(item => sessionItemToGalleryItem(item, objectUrls));
  return sortGalleryItems([...sessionItems, ...favoriteItems]);
}

/**
 * 加载 temp 画廊
 * @param tempId 临时 id
 * @param objectUrls URL 集合
 * @returns items
 */
function loadTempMountItems(tempId: string, objectUrls: Set<string>): InlineGalleryItem[] {
  return sortGalleryItems(
    listTempSessionItems(tempId).map(item => sessionItemToGalleryItem(item, objectUrls)),
  );
}

/**
 * IDB 记录 → 画廊项
 * @param record 收藏
 * @param slotId 位点
 * @param objectUrls 集合
 * @returns item
 */
function createFavoriteItem(
  record: InlineImageFavoriteListItem,
  slotId: string,
  objectUrls: Set<string>,
): InlineGalleryItem {
  return {
    id: `favorite-${record.id}`,
    favoriteId: record.id,
    slotId,
    imageBlob: record.imageBlob,
    objectUrl: createTrackedObjectUrl(record.imageBlob, objectUrls),
    promptSnapshot: record.promptSnapshot,
    createdAt: record.createdAt,
  };
}

/**
 * 会话项 → 画廊项
 * @param item 会话项
 * @param objectUrls 集合
 * @returns 画廊项
 */
function sessionItemToGalleryItem(
  item: GallerySessionItem,
  objectUrls: Set<string>,
): InlineGalleryItem {
  return {
    id: item.id,
    favoriteId: item.favoriteId,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    objectUrl: createTrackedObjectUrl(item.imageBlob, objectUrls),
    promptSnapshot: item.promptSnapshot,
    createdAt: item.createdAt,
  };
}

/**
 * 构建 favorite 服务 host
 * @param mount runtime
 * @param items items
 * @returns host
 */
function buildFavoriteHost(
  mount: GalleryMountRuntime,
  items: InlineGalleryItem[],
): {
  slotId: string | null;
  anchor: InlineFavoriteAnchor;
  items: InlineGalleryItem[];
} {
  const slotId =
    mount.mountKey.kind === 'slot' ? mount.mountKey.slotId : (items.find(i => i.slotId)?.slotId ?? null);
  return { slotId, anchor: mount.anchor, items };
}

/**
 * 按创建时间从新到旧排序
 * @param items 画廊项
 * @returns 排序后的项
 */
function sortGalleryItems(items: InlineGalleryItem[]): InlineGalleryItem[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}
