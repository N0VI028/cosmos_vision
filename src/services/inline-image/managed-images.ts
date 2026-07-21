import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineImageFavoriteGroup, InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';
import type { TemporaryImageRecord } from '@/services/inline-image/temporary-images';

/** 管理面板图片类型 */
export type ManagedImageKind = 'favorite' | 'temporary';

/** 管理面板统一列表项（复合 key 避免 number/string 冲突） */
export interface ManagedImageItem {
  /** `favorite:${id}` 或 `temporary:${id}` */
  key: string;
  kind: ManagedImageKind;
  sourceId: number | string;
  /** 段落画廊位点；收藏/临时互换时复用 */
  slotId: string;
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
      slotId: record.slotId,
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
    slotId: record.slotId,
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

/**
 * 把管理项写入收藏分组（同 scope 合并；无则新建）
 * @param groups 现有分组
 * @param item 源管理项（blob/scope 复用）
 * @param favoriteId 新收藏 ID
 * @param filePath 收藏文件路径
 * @returns 新分组数组
 */
export function upsertManagedFavoriteGroup(
  groups: InlineImageFavoriteGroup[],
  item: ManagedImageItem,
  favoriteId: number,
  filePath: string,
): InlineImageFavoriteGroup[] {
  const record = toManagedFavoriteRecord(item, favoriteId, filePath);
  const groupId = managedChatGroupId(item);
  const existing = groups.find(group => group.id === groupId);
  if (!existing) {
    return [
      ...groups,
      {
        id: groupId,
        characterKey: item.characterKey,
        chatId: item.chatId,
        count: 1,
        updatedAt: record.createdAt,
        records: [record],
      },
    ];
  }
  return groups.map(group => group.id === groupId ? prependFavoriteRecord(group, record) : group);
}

/**
 * 管理项 → 收藏记录
 * @param item 管理项
 * @param favoriteId 收藏 ID
 * @param filePath 收藏文件路径
 * @returns 收藏记录
 */
function toManagedFavoriteRecord(
  item: ManagedImageItem,
  favoriteId: number,
  filePath: string,
): InlineImageFavoriteListItem {
  return {
    id: favoriteId,
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: item.promptSnapshot,
    createdAt: item.createdAt,
    filePath,
  };
}

/**
 * 向收藏分组头部写入记录
 * @param group 收藏分组
 * @param record 收藏记录
 * @returns 更新后的分组
 */
function prependFavoriteRecord(
  group: InlineImageFavoriteGroup,
  record: InlineImageFavoriteListItem,
): InlineImageFavoriteGroup {
  const records = [record, ...group.records.filter(entry => entry.id !== record.id)]
    .sort((left, right) => right.createdAt - left.createdAt);
  return { ...group, count: records.length, updatedAt: records[0].createdAt, records };
}

/**
 * 从收藏分组移除指定 ID
 * @param groups 现有分组
 * @param favoriteId 收藏 ID
 * @returns 新分组数组
 */
export function removeManagedFavoriteId(
  groups: InlineImageFavoriteGroup[],
  favoriteId: number,
): InlineImageFavoriteGroup[] {
  return groups
    .map(group => {
      const records = group.records.filter(record => record.id !== favoriteId);
      if (records.length === group.records.length) return group;
      if (!records.length) return null;
      return {
        ...group,
        count: records.length,
        updatedAt: Math.max(...records.map(record => record.createdAt)),
        records,
      };
    })
    .filter((group): group is InlineImageFavoriteGroup => Boolean(group));
}

/**
 * 管理项 → 临时记录
 * @param item 管理项
 * @param temporaryId 临时 ID
 * @param createdAt 写入时间
 * @returns 临时记录
 */
export function toTemporaryRecordFromManaged(
  item: ManagedImageItem,
  temporaryId: string,
  createdAt: number,
): TemporaryImageRecord {
  return {
    id: temporaryId,
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: item.promptSnapshot,
    createdAt,
  };
}
