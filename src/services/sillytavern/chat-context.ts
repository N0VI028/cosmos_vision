import type { InlineImageFavoriteScope } from '@/services/inline-image/favorites-cache';
import { getCurrentCharacterKey } from '@/services/tavern-helper/prompt-profiles-context';
import { getCurrentChatId } from '@sillytavern/script';

/**
 * 读取当前段落图片收藏作用域
 * @returns 当前角色和聊天 ID，缺失时返回 null
 */
export function getCurrentInlineFavoriteScope(): InlineImageFavoriteScope | null {
  const characterKey = getCurrentCharacterKey();
  const chatId = normalizeScopeKey(getCurrentChatId());
  return characterKey && chatId ? { characterKey, chatId } : null;
}

/**
 * 规范化收藏作用域字段
 * @param value 原始字段值
 * @returns 可用字符串或 null
 */
function normalizeScopeKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
