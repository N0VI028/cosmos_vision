import { uuidv4 } from '@sillytavern/scripts/utils';

import { cloneInlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  deleteInlineImageFavorite,
  saveInlineImageFavorite,
} from '@/services/inline-image/favorites-cache';
import type { ManagedImageItem } from '@/services/inline-image/managed-images';
import {
  deleteTemporaryImage,
  saveTemporaryImage,
} from '@/services/inline-image/temporary-images';

/**
 * 互换管理图片的收藏/临时状态（先写入目标，再删除来源）
 * @param item 当前管理项
 * @param temporaryLimit 临时图数量上限
 */
export async function convertManagedImageKind(
  item: ManagedImageItem,
  temporaryLimit: number,
): Promise<void> {
  if (item.kind === 'temporary') {
    await promoteTemporaryToFavorite(item);
    return;
  }
  await demoteFavoriteToTemporary(item, temporaryLimit);
}

/**
 * 临时图转为收藏图
 * @param item 临时管理项
 */
async function promoteTemporaryToFavorite(item: ManagedImageItem): Promise<void> {
  await saveInlineImageFavorite({
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  });
  await deleteTemporaryImage(String(item.sourceId));
}

/**
 * 收藏图转为临时图
 * @param item 收藏管理项
 * @param temporaryLimit 临时图数量上限
 */
async function demoteFavoriteToTemporary(
  item: ManagedImageItem,
  temporaryLimit: number,
): Promise<void> {
  await saveTemporaryImage(
    {
      id: `temporary-${uuidv4()}`,
      characterKey: item.characterKey,
      chatId: item.chatId,
      slotId: item.slotId,
      imageBlob: item.imageBlob,
      promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
      // 用当前时间，避免旧收藏转入后立刻被数量上限淘汰
      createdAt: Date.now(),
    },
    temporaryLimit,
  );
  await deleteInlineImageFavorite(Number(item.sourceId));
}
