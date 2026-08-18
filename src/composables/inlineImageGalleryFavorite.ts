import { cloneInlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import {
  deleteInlineImageFavorite,
  saveInlineImageFavorite,
  type InlineImageFavoriteRecord,
} from '@/services/inline-image/favorites-cache';
import {
  ensureSlotShortcodeOnParagraph,
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
 * 收藏图片：上传本地文件并绑定 slot；raw 仅保证一枚短码
 * 前端型楼层尾 mount（paragraph 为 null）跳过 raw 短码绑定，仅存 IDB favorite 记录
 * @param group 画廊组
 * @param item 画廊项
 * @param bindSlot 把组升级为 slot 键的回调
 * @returns 是否完成 raw 短码绑定（前端型始终返回 false）
 */
export async function favoriteGalleryItem(
  group: GalleryFavoriteHost,
  item: InlineGalleryItem,
  bindSlot: (slotId: string) => void,
): Promise<boolean> {
  const paragraph = group.anchor.paragraph;
  const slotId = resolveFavoriteSlotId(group, paragraph);
  item.createdAt = Date.now();
  item.slotId = slotId;
  const record = buildFavoriteRecord(item, slotId);
  if (!record) throw new Error('当前角色或聊天未就绪，暂时无法收藏图片');
  item.favoriteId = (await saveInlineImageFavorite(record)).id;
  bindSlot(slotId);
  // 前端型楼层尾无宿主段落，跳过 raw 短码绑定
  if (!paragraph) return false;
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
 * 取消收藏：删除本地文件；slot 空才去短码
 * @param group 画廊组
 * @param item 画廊项
 */
export async function unfavoriteGalleryItem(group: GalleryFavoriteHost, item: InlineGalleryItem): Promise<void> {
  if (!item.favoriteId) return;
  const slotId = item.slotId ?? group.slotId;
  await deleteInlineImageFavorite(item.favoriteId);
  item.favoriteId = null;
  item.slotId = slotId;
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
  item.slotId = slotId;
}

/**
 * 解析收藏应使用的 slotId
 * @param group 画廊组
 * @param paragraph 宿主段落（前端型为 null）
 * @returns slotId
 */
function resolveFavoriteSlotId(group: GalleryFavoriteHost, paragraph: HTMLElement | null): string {
  return group.slotId ?? (paragraph && resolveParagraphSlotId(paragraph)) ?? itemSlotFromGroup(group) ?? newSlotId();
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
 * 构建收藏文件记录（仅 scope + slotId + 图 + 快照 + 时间）
 * @param item 画廊项
 * @param slotId 位点 id
 * @returns 收藏记录或 null
 */
function buildFavoriteRecord(
  item: InlineGalleryItem,
  slotId: string,
): Omit<InlineImageFavoriteRecord, 'id'> | null {
  const scope = getCurrentInlineFavoriteScope();
  if (!scope) return null;
  return {
    ...scope,
    slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  };
}
