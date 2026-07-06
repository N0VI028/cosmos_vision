import type { InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';
import type { InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';
import { getMessageSwipeId } from '@/services/sillytavern/chat-dom';

type FavoriteSwipeRecord = Pick<InlineImageFavoriteListItem, 'swipeId'>;
type FavoriteMessageRecord = Pick<InlineImageFavoriteListItem, 'mesId' | 'swipeId'>;
type FavoriteAnchorRecord = Pick<InlineImageFavoriteListItem, 'mesId' | 'swipeId' | 'paragraphTextHash'>;
type FavoriteAnchorTarget = Pick<InlineFavoriteAnchor, 'mesId' | 'swipeId' | 'paragraphTextHash'>;

/**
 * 判断收藏记录是否保存了明确的 swipe 版本
 * @param record 收藏记录
 * @returns 是否带有 swipeId
 */
export function hasFavoriteSwipeId(record: FavoriteSwipeRecord): boolean {
  return typeof record.swipeId === 'number';
}

/**
 * 判断收藏记录是否属于指定消息当前可见的 swipe
 * @param record 收藏记录
 * @param messageId 当前消息楼层 ID
 * @returns 是否属于当前 swipe
 */
export function isFavoriteRecordVisibleForMessage(
  record: FavoriteMessageRecord,
  messageId: string,
): boolean {
  const currentSwipeId = getMessageSwipeId(messageId);
  if (hasFavoriteSwipeId(record)) return currentSwipeId === record.swipeId;
  return currentSwipeId === null || currentSwipeId === 0;
}

/**
 * 判断收藏记录是否仍属于当前聊天里可见的消息版本
 * @param record 收藏记录
 * @returns 是否仍可见
 */
export function isFavoriteRecordVisibleInCurrentChat(record: FavoriteMessageRecord): boolean {
  if (!hasFavoriteSwipeId(record) || !record.mesId) return true;
  return getMessageSwipeId(record.mesId) === record.swipeId;
}

/**
 * 判断收藏记录是否应显示在当前段落锚点上
 * @param record 收藏记录
 * @param anchor 当前可见段落锚点
 * @returns 是否应显示
 */
export function shouldRenderFavoriteRecordAtAnchor(
  record: FavoriteAnchorRecord,
  anchor: FavoriteAnchorTarget,
): boolean {
  if (record.mesId && anchor.mesId && record.mesId !== anchor.mesId) return false;
  if (hasFavoriteSwipeId(record)) return anchor.swipeId === record.swipeId;
  if (anchor.swipeId === undefined || anchor.swipeId === 0) return true;
  return !record.paragraphTextHash || anchor.paragraphTextHash === record.paragraphTextHash;
}
