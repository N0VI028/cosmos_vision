import { cloneInlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import {
  deleteInlineImageFavorite,
  listInlineImageFavoritesBySlot,
  saveInlineImageFavorite,
  type InlineImageFavoriteRecord,
} from '@/services/inline-image/favorites-cache';
import {
  ensureSlotShortcodeOnParagraph,
  removeSlotShortcodeFromMessage,
  resolveParagraphSlotId,
} from '@/services/inline-image/slot-bind';
import { newSlotId } from '@/services/inline-image/slot-shortcode';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import type { InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';

export interface GalleryFavoriteHost {
  slotId: string | null;
  anchor: InlineFavoriteAnchor;
  items: InlineGalleryItem[];
}

/**
 * 收藏图片：入库绑定 slot；raw 仅保证一枚短码；写 raw 失败保留 IDB
 * @param group 画廊组
 * @param item 画廊项
 * @param bindSlot 把组升级为 slot 键的回调
 * @returns 是否完成 raw 短码绑定
 */
export async function favoriteGalleryItem(
  group: GalleryFavoriteHost,
  item: InlineGalleryItem,
  bindSlot: (slotId: string) => void,
): Promise<boolean> {
  const paragraph = group.anchor.paragraph;
  if (!paragraph) throw new Error('未找到宿主段落，无法收藏图片');
  const slotId = resolveFavoriteSlotId(group, paragraph);
  item.createdAt = Date.now();
  item.slotId = slotId;
  const record = buildFavoriteRecord(group, item, slotId);
  if (!record) throw new Error('当前角色或聊天未就绪，暂时无法收藏图片');
  item.favoriteId = await saveInlineImageFavorite(record);
  bindSlot(slotId);
  try {
    await ensureSlotShortcodeOnParagraph(paragraph, slotId);
    return true;
  } catch (error) {
    console.error('[CosmosVision] 收藏图已保存但绑定原文失败', error);
    toastr.warning('图已保存但未绑定到原文，可重试绑定');
    return false;
  }
}

/**
 * 取消收藏：删 IDB；slot 空才去短码
 * @param group 画廊组
 * @param item 画廊项
 */
export async function unfavoriteGalleryItem(group: GalleryFavoriteHost, item: InlineGalleryItem): Promise<void> {
  if (!item.favoriteId) return;
  const slotId = item.slotId ?? group.slotId;
  await deleteInlineImageFavorite(item.favoriteId);
  item.favoriteId = null;
  if (slotId) await maybeRemoveEmptySlotShortcode(group, slotId);
}

/**
 * 删除收藏图并在 slot 空时去短码
 * @param group 画廊组
 * @param item 画廊项
 */
export async function deleteFavoriteGalleryItem(group: GalleryFavoriteHost, item: InlineGalleryItem): Promise<void> {
  if (!item.favoriteId) return;
  const slotId = item.slotId ?? group.slotId;
  await deleteInlineImageFavorite(item.favoriteId);
  if (slotId) await maybeRemoveEmptySlotShortcode(group, slotId);
}

/**
 * 解析收藏应使用的 slotId
 * @param group 画廊组
 * @param paragraph 宿主段落
 * @returns slotId
 */
function resolveFavoriteSlotId(group: GalleryFavoriteHost, paragraph: HTMLElement): string {
  return group.slotId ?? resolveParagraphSlotId(paragraph) ?? itemSlotFromGroup(group) ?? newSlotId();
}

/**
 * 从组内已有项读取 slotId
 * @param group 画廊组
 * @returns slotId 或 null
 */
function itemSlotFromGroup(group: GalleryFavoriteHost): string | null {
  return group.items.find(item => item.slotId)?.slotId ?? null;
}

/**
 * 构建 IndexedDB 收藏记录（仅 scope + slotId + 图 + 快照 + 时间）
 * @param group 画廊组
 * @param item 画廊项
 * @param slotId 位点 id
 * @returns 收藏记录或 null
 */
function buildFavoriteRecord(
  group: GalleryFavoriteHost,
  item: InlineGalleryItem,
  slotId: string,
): Omit<InlineImageFavoriteRecord, 'id'> | null {
  const scope = getCurrentInlineFavoriteScope();
  if (!scope || !group.anchor.paragraph) return null;
  return {
    ...scope,
    slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  };
}

/**
 * slot 下已无收藏图时定点去掉短码
 * @param group 画廊组
 * @param slotId 位点 id
 */
async function maybeRemoveEmptySlotShortcode(group: GalleryFavoriteHost, slotId: string): Promise<void> {
  const rest = await listInlineImageFavoritesBySlot(slotId, getCurrentInlineFavoriteScope());
  if (rest.length > 0) return;
  const target = group.anchor.paragraph ?? group.anchor.mesId;
  if (!target) return;
  try {
    await removeSlotShortcodeFromMessage(target, slotId);
  } catch (error) {
    console.warn('[CosmosVision] 移除空位短码失败', error);
  }
}
