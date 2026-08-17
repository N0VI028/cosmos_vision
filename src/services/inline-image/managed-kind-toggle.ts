import { uuidv4 } from '@sillytavern/scripts/utils';

import { cloneInlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { deleteInlineImageFavorite, saveInlineImageFavorite } from '@/services/inline-image/favorites-cache';
import { loadImageBlob, type ManagedImageItem } from '@/services/inline-image/managed-images';
import { deleteTemporaryImage, saveTemporaryImage } from '@/services/inline-image/temporary-images';

/** 管理图片状态互换结果 */
export type ConvertImageKindResult =
  | {
      from: 'temporary';
      to: 'favorite';
      temporaryId: string;
      favoriteId: number;
      filePath: string;
      createdAt: number;
      /** 互换加载出的图片数据（供会话同步层复用，避免二次加载） */
      imageBlob: Blob;
    }
  | {
      from: 'favorite';
      to: 'temporary';
      favoriteId: number;
      temporaryId: string;
      createdAt: number;
      /** 互换加载出的图片数据（供会话同步层复用，避免二次加载） */
      imageBlob: Blob;
    };

/**
 * 互换管理图片的收藏/临时状态（先写入目标，再删除来源）
 * @param item 当前管理项
 * @param temporaryLimit 临时图数量上限
 * @returns 互换结果
 */
export async function convertManagedImageKind(
  item: ManagedImageItem,
  temporaryLimit: number,
): Promise<ConvertImageKindResult> {
  const imageBlob = await loadImageBlob(item);
  return item.kind === 'temporary'
    ? promoteTemporaryToFavorite(item, imageBlob)
    : demoteFavoriteToTemporary(item, imageBlob, temporaryLimit);
}

/**
 * 临时图转为收藏图
 * @param item 临时管理项
 * @param imageBlob 按需加载的图片数据
 * @returns 互换结果
 */
async function promoteTemporaryToFavorite(item: ManagedImageItem, imageBlob: Blob): Promise<ConvertImageKindResult> {
  const temporaryId = String(item.sourceId);
  const saved = await saveInlineImageFavorite({
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    imageBlob,
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  });
  await deleteTemporaryImage(temporaryId);
  return {
    from: 'temporary',
    to: 'favorite',
    temporaryId,
    favoriteId: saved.id,
    filePath: saved.filePath,
    createdAt: item.createdAt,
    imageBlob,
  };
}

/**
 * 收藏图转为临时图
 * @param item 收藏管理项
 * @param imageBlob 按需加载的图片数据
 * @param temporaryLimit 临时图数量上限
 * @returns 互换结果
 */
async function demoteFavoriteToTemporary(
  item: ManagedImageItem,
  imageBlob: Blob,
  temporaryLimit: number,
): Promise<ConvertImageKindResult> {
  const favoriteId = Number(item.sourceId);
  const temporaryId = `temporary-${uuidv4()}`;
  const createdAt = Date.now();
  await saveTemporaryImage(
    {
      id: temporaryId,
      characterKey: item.characterKey,
      chatId: item.chatId,
      slotId: item.slotId,
      imageBlob,
      promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
      // 用当前时间，避免旧收藏转入后立刻被数量上限淘汰
      createdAt,
    },
    temporaryLimit,
  );
  await deleteInlineImageFavorite(favoriteId);
  return { from: 'favorite', to: 'temporary', favoriteId, temporaryId, createdAt, imageBlob };
}
