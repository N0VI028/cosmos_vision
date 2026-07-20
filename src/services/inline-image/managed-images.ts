import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineImageFavoriteGroup } from '@/services/inline-image/favorites-cache';
import type { TemporaryImageRecord } from '@/services/inline-image/temporary-images';

/** 管理面板图片类型 */
export type ManagedImageKind = 'favorite' | 'temporary';

/** 管理面板统一列表项（复合 key 避免 number/string 冲突） */
export interface ManagedImageItem {
  /** `favorite:${id}` 或 `temporary:${id}` */
  key: string;
  kind: ManagedImageKind;
  sourceId: number | string;
  characterKey: string;
  chatId: string;
  createdAt: number;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
}

/**
 * 构建收藏图片复合 key
 * @param id 收藏 ID
 * @returns 复合 key
 */
export function managedFavoriteKey(id: number): string {
  return `favorite:${id}`;
}

/**
 * 构建临时图片复合 key
 * @param id 临时图 ID
 * @returns 复合 key
 */
export function managedTemporaryKey(id: string): string {
  return `temporary:${id}`;
}

/**
 * 解析管理面板复合 key
 * @param key 复合 key
 * @returns 类型与源 ID；非法时返回 null
 */
export function parseManagedImageKey(
  key: string,
): { kind: ManagedImageKind; sourceId: number | string } | null {
  if (key.startsWith('favorite:')) {
    const sourceId = Number(key.slice('favorite:'.length));
    return Number.isFinite(sourceId) ? { kind: 'favorite', sourceId } : null;
  }
  if (key.startsWith('temporary:')) {
    return { kind: 'temporary', sourceId: key.slice('temporary:'.length) };
  }
  return null;
}

/**
 * 将收藏分组展开为管理项
 * @param groups 收藏分组
 * @returns 管理项列表
 */
export function toManagedFavoriteItems(groups: InlineImageFavoriteGroup[]): ManagedImageItem[] {
  return groups.flatMap(group =>
    group.records.map(record => ({
      key: managedFavoriteKey(record.id),
      kind: 'favorite' as const,
      sourceId: record.id,
      characterKey: record.characterKey,
      chatId: record.chatId,
      createdAt: record.createdAt,
      imageBlob: record.imageBlob,
      promptSnapshot: record.promptSnapshot,
    })),
  );
}

/**
 * 将临时图记录转为管理项
 * @param records 临时图记录
 * @returns 管理项列表
 */
export function toManagedTemporaryItems(records: TemporaryImageRecord[]): ManagedImageItem[] {
  return records.map(record => ({
    key: managedTemporaryKey(record.id),
    kind: 'temporary' as const,
    sourceId: record.id,
    characterKey: record.characterKey,
    chatId: record.chatId,
    createdAt: record.createdAt,
    imageBlob: record.imageBlob,
    promptSnapshot: record.promptSnapshot,
  }));
}

/**
 * 合并收藏与临时管理项并按创建时间倒序
 * @param favorites 收藏管理项
 * @param temporaries 临时管理项
 * @returns 混排列表
 */
export function mergeManagedImageItems(
  favorites: ManagedImageItem[],
  temporaries: ManagedImageItem[],
): ManagedImageItem[] {
  return [...favorites, ...temporaries].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 构建角色+聊天复合分组 id
 * @param item 管理项
 * @returns `characterKey::chatId`
 */
export function managedChatGroupId(item: Pick<ManagedImageItem, 'characterKey' | 'chatId'>): string {
  return `${item.characterKey}::${item.chatId}`;
}
