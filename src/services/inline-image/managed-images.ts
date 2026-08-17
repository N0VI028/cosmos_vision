import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { loadFavoriteImageBlob, type InlineImageFavoriteMeta } from '@/services/inline-image/favorites-cache';
import { loadTemporaryImageBlob, type TemporaryImageMeta } from '@/services/inline-image/temporary-images';

/** 管理面板图片类型 */
export type ManagedImageKind = 'favorite' | 'temporary';

/** 按需加载 Blob 所需的最小定位信息 */
export type ManagedImageBlobSource = Pick<ManagedImageItem, 'key' | 'kind' | 'sourceId' | 'filePath'>;

/**
 * 管理面板统一列表项（复合 key 避免 number/string 冲突）
 * 仅元数据：图片数据通过 loadImageBlob 按需加载
 */
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
  /** 收藏文件路径（临时图为空串）——按需加载定位用 */
  filePath: string;
  promptSnapshot: InlinePromptSnapshot;
}

/** Blob 加载并发上限（可见窗口逐张加载时的同时请求数） */
const MAX_BLOB_LOAD_CONCURRENCY = 4;
/** Blob LRU 缓存容量（约两屏卡片量） */
const BLOB_CACHE_LIMIT = 24;

const blobCache = new Map<string, Blob>();
const inFlightBlobLoads = new Map<string, Promise<Blob>>();
let runningBlobLoads = 0;
const blobLoadWaiters: Array<() => void> = [];

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
 * 将收藏元数据展开为管理项
 * @param metas 收藏元数据列表
 * @returns 管理项列表
 */
export function toManagedFavoriteItems(metas: InlineImageFavoriteMeta[]): ManagedImageItem[] {
  return metas.map(meta => ({
    key: managedFavoriteKey(meta.id),
    kind: 'favorite' as const,
    sourceId: meta.id,
    slotId: meta.slotId,
    characterKey: meta.characterKey,
    chatId: meta.chatId,
    createdAt: meta.createdAt,
    filePath: meta.filePath,
    promptSnapshot: meta.promptSnapshot,
  }));
}

/**
 * 将临时图元数据转为管理项
 * @param metas 临时图元数据列表
 * @returns 管理项列表
 */
export function toManagedTemporaryItems(metas: TemporaryImageMeta[]): ManagedImageItem[] {
  return metas.map(meta => ({
    key: managedTemporaryKey(meta.id),
    kind: 'temporary' as const,
    sourceId: meta.id,
    slotId: meta.slotId,
    characterKey: meta.characterKey,
    chatId: meta.chatId,
    createdAt: meta.createdAt,
    filePath: '',
    promptSnapshot: meta.promptSnapshot,
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
 * 管理项 → 收藏元数据（类型互换后就地补丁用）
 * @param item 源管理项
 * @param favoriteId 新收藏 ID
 * @param filePath 收藏文件路径
 * @returns 收藏元数据
 */
export function toFavoriteMetaFromItem(
  item: ManagedImageItem,
  favoriteId: number,
  filePath: string,
): InlineImageFavoriteMeta {
  return {
    id: favoriteId,
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    promptSnapshot: item.promptSnapshot,
    createdAt: item.createdAt,
    filePath,
  };
}

/**
 * 管理项 → 临时元数据（类型互换后就地补丁用）
 * @param item 源管理项
 * @param temporaryId 临时 ID
 * @param createdAt 写入时间
 * @returns 临时元数据
 */
export function toTemporaryMetaFromItem(
  item: ManagedImageItem,
  temporaryId: string,
  createdAt: number,
): TemporaryImageMeta {
  return {
    id: temporaryId,
    characterKey: item.characterKey,
    chatId: item.chatId,
    slotId: item.slotId,
    promptSnapshot: item.promptSnapshot,
    createdAt,
  };
}

/**
 * 按需加载管理图片 Blob：收藏走 ST 文件接口、临时走 IndexedDB；
 * 带缓存命中（LRU）、并发上限与去重（同图并发只发一次）
 * @param source 定位信息（管理项或其子集）
 * @returns 图片 Blob；文件缺失时抛错
 */
export function loadImageBlob(source: ManagedImageBlobSource): Promise<Blob> {
  const cacheKey = resolveBlobCacheKey(source);
  const cached = readCachedBlob(cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = inFlightBlobLoads.get(cacheKey);
  if (pending) return pending;
  const load = runBlobLoad(() => resolveManagedImageBlob(source, cacheKey)).finally(() => {
    inFlightBlobLoads.delete(cacheKey);
  });
  inFlightBlobLoads.set(cacheKey, load);
  return load;
}

/**
 * 解析缓存/去重用定位键：收藏 ID 会因删除最大 ID 而复用（串图风险），
 * 故收藏用每次保存唯一的 filePath、临时图用永不复用的 uuid ID
 * @param source 定位信息
 * @returns 不可复用的缓存键
 */
function resolveBlobCacheKey(source: ManagedImageBlobSource): string {
  return source.kind === 'favorite' ? `favorite-file:${source.filePath}` : `temporary:${source.sourceId}`;
}

/**
 * 分流加载单张图片
 * @param source 定位信息
 * @param cacheKey 缓存键
 * @returns 图片 Blob
 */
async function resolveManagedImageBlob(source: ManagedImageBlobSource, cacheKey: string): Promise<Blob> {
  const blob =
    source.kind === 'favorite'
      ? await loadFavoriteImageBlob(source.filePath)
      : await loadTemporaryImageBlob(String(source.sourceId));
  if (!blob) throw new Error(`图片文件不存在或已删除：${source.key}`);
  cacheBlob(cacheKey, blob);
  return blob;
}

/**
 * 读取缓存 Blob 并刷新 LRU 新鲜度
 * @param cacheKey 缓存键
 * @returns 缓存的 Blob；未命中返回 undefined
 */
function readCachedBlob(cacheKey: string): Blob | undefined {
  const cached = blobCache.get(cacheKey);
  if (!cached) return undefined;
  blobCache.delete(cacheKey);
  blobCache.set(cacheKey, cached);
  return cached;
}

/**
 * 写入缓存并按容量淘汰最旧条目
 * @param cacheKey 缓存键
 * @param blob 图片 Blob
 */
function cacheBlob(cacheKey: string, blob: Blob): void {
  blobCache.set(cacheKey, blob);
  while (blobCache.size > BLOB_CACHE_LIMIT) {
    const oldest = blobCache.keys().next().value;
    if (oldest === undefined) break;
    blobCache.delete(oldest);
  }
}

/**
 * 以并发上限执行加载任务（超限任务排队等待）
 * @param task 加载任务
 * @returns 任务结果
 */
async function runBlobLoad<T>(task: () => Promise<T>): Promise<T> {
  while (runningBlobLoads >= MAX_BLOB_LOAD_CONCURRENCY) {
    await new Promise<void>(resolve => blobLoadWaiters.push(resolve));
  }
  runningBlobLoads += 1;
  try {
    return await task();
  } finally {
    runningBlobLoads -= 1;
    blobLoadWaiters.shift()?.();
  }
}
