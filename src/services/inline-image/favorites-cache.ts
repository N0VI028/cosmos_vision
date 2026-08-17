import { uuidv4 } from '@sillytavern/scripts/utils';

import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  blobToBase64,
  deleteSillyTavernFile,
  readSillyTavernFileBlobOrNull,
  readSillyTavernJson,
  uploadSillyTavernFile,
  uploadSillyTavernJson,
} from '@/services/sillytavern/files';

const FAVORITE_MANIFEST_NAME = 'CV-favorites.json';
const FAVORITE_MANIFEST_PATH = `/user/files/${FAVORITE_MANIFEST_NAME}`;
const FAVORITE_MANIFEST_VERSION = 1;

export interface InlineImageFavoriteScope {
  characterKey: string;
  chatId: string;
}

export interface InlineImageFavoriteRecord extends InlineImageFavoriteScope {
  id?: number;
  slotId: string;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

export type InlineImageFavoriteListItem = InlineImageFavoriteRecord & { id: number; filePath: string };

/** 收藏图片元数据（清单原样，无 Blob）——按需水合用 */
export type InlineImageFavoriteMeta = FavoriteManifestEntry;

export interface InlineImageFavoriteGroup extends InlineImageFavoriteScope {
  id: string;
  count: number;
  updatedAt: number;
  records: InlineImageFavoriteListItem[];
}

interface FavoriteManifestEntry extends InlineImageFavoriteScope {
  id: number;
  slotId: string;
  filePath: string;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

interface FavoriteManifest {
  version: 1;
  records: FavoriteManifestEntry[];
}

let manifestWriteQueue = Promise.resolve();

/**
 * 保存单张段落图片收藏记录
 * @param record 待保存的收藏记录
 * @returns 收藏 ID 与文件路径
 */
export async function saveInlineImageFavorite(
  record: Omit<InlineImageFavoriteRecord, 'id'>,
): Promise<{ id: number; filePath: string }> {
  return mutateFavoriteManifest(async manifest => {
    const id = nextFavoriteId(manifest.records);
    const fileName = `CV-favorite-${uuidv4()}.${resolveBlobExtension(record.imageBlob)}`;
    const filePath = await uploadSillyTavernFile(fileName, await blobToBase64(record.imageBlob));
    manifest.records.push(createManifestEntry(record, id, filePath));
    return { id, filePath };
  });
}

/**
 * 按位点读取收藏图片
 * @param slotId 段落位点 ID
 * @param scope 可选角色与聊天作用域
 * @returns 收藏图片列表
 */
export async function listInlineImageFavoritesBySlot(
  slotId: string,
  scope?: InlineImageFavoriteScope | null,
): Promise<InlineImageFavoriteListItem[]> {
  if (!slotId) return [];
  const entries = (await readFavoriteManifest()).records.filter(entry => entry.slotId === slotId);
  const scoped = scope ? entries.filter(entry => matchesFavoriteScope(entry, scope)) : entries;
  return hydrateFavoriteEntries(sortFavoriteEntries(scoped));
}

/**
 * 读取指定作用域收藏图片
 * @param scope 角色与聊天作用域
 * @returns 收藏图片列表
 */
export async function listInlineImageFavorites(
  scope: InlineImageFavoriteScope,
): Promise<InlineImageFavoriteListItem[]> {
  const entries = (await readFavoriteManifest()).records.filter(entry => matchesFavoriteScope(entry, scope));
  return hydrateFavoriteEntries(sortFavoriteEntries(entries));
}

/**
 * 读取全部收藏图片管理分组
 * @returns 收藏分组
 */
export async function listInlineImageFavoriteGroups(): Promise<InlineImageFavoriteGroup[]> {
  return buildInlineImageFavoriteGroups(await exportInlineImageFavoriteRecords());
}

/**
 * 仅读取收藏清单元数据（不发起任何图片文件请求）
 * @returns 按创建时间倒序的元数据列表
 */
export async function listInlineImageFavoriteMeta(): Promise<InlineImageFavoriteMeta[]> {
  // 等待进行中的清单写入完成，避免读到中间态
  await manifestWriteQueue;
  return sortFavoriteEntries((await readFavoriteManifest()).records);
}

/**
 * 按需读取单张收藏图片
 * @param filePath 清单中的文件路径
 * @returns 图片 Blob；文件不存在时返回 null
 */
export function loadFavoriteImageBlob(filePath: string): Promise<Blob | null> {
  return readSillyTavernFileBlobOrNull(filePath);
}

/**
 * 导出全部收藏图片记录
 * @returns 已水合的收藏记录
 */
export async function exportInlineImageFavoriteRecords(): Promise<InlineImageFavoriteListItem[]> {
  return hydrateFavoriteEntries(sortFavoriteEntries((await readFavoriteManifest()).records));
}

/**
 * 导入收藏图片记录
 * @param records 外部收藏记录
 * @returns 成功导入数量
 */
export async function importInlineImageFavoriteRecords(records: InlineImageFavoriteRecord[]): Promise<number> {
  for (const record of records) await saveInlineImageFavorite(record);
  return records.length;
}

/**
 * 删除单张收藏图片
 * @param id 收藏 ID
 */
export async function deleteInlineImageFavorite(id: number): Promise<void> {
  await mutateFavoriteManifest(async manifest => {
    const entry = manifest.records.find(record => record.id === id);
    if (!entry) return;
    await deleteSillyTavernFile(entry.filePath);
    manifest.records = manifest.records.filter(record => record.id !== id);
  });
}

/**
 * 删除指定作用域全部收藏图片
 * @param scope 角色与聊天作用域
 */
export async function deleteInlineImageFavoriteScope(scope: InlineImageFavoriteScope): Promise<void> {
  await mutateFavoriteManifest(async manifest => {
    const targets = manifest.records.filter(record => matchesFavoriteScope(record, scope));
    for (const target of targets) await deleteSillyTavernFile(target.filePath);
    manifest.records = manifest.records.filter(record => !matchesFavoriteScope(record, scope));
  });
}

/**
 * 删除全部收藏图片
 */
export async function clearInlineImageFavorites(): Promise<void> {
  await mutateFavoriteManifest(async manifest => {
    for (const record of manifest.records) await deleteSillyTavernFile(record.filePath);
    manifest.records = [];
  });
}

/**
 * 读取并校验收藏清单
 * @returns 收藏清单
 */
async function readFavoriteManifest(): Promise<FavoriteManifest> {
  const manifest = await readSillyTavernJson<FavoriteManifest>(FAVORITE_MANIFEST_PATH);
  if (!manifest) return createEmptyManifest();
  if (manifest.version !== FAVORITE_MANIFEST_VERSION || !Array.isArray(manifest.records)) {
    throw new Error('收藏图片清单格式无效');
  }
  return manifest;
}

/**
 * 串行写入收藏清单
 * @param manifest 收藏清单
 */
async function mutateFavoriteManifest<T>(mutate: (manifest: FavoriteManifest) => Promise<T>): Promise<T> {
  const task = manifestWriteQueue.then(async () => {
    const manifest = await readFavoriteManifest();
    const result = await mutate(manifest);
    await uploadSillyTavernJson(FAVORITE_MANIFEST_NAME, manifest);
    return result;
  });
  manifestWriteQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/**
 * 水合收藏清单记录
 * @param entries 清单记录
 * @returns 带 Blob 的收藏记录
 */
async function hydrateFavoriteEntries(entries: FavoriteManifestEntry[]): Promise<InlineImageFavoriteListItem[]> {
  const hydrated = await Promise.all(entries.map(hydrateFavoriteEntry));
  return hydrated.filter((entry): entry is InlineImageFavoriteListItem => Boolean(entry));
}

/**
 * 水合单条收藏清单记录
 * @param entry 清单记录
 * @returns 带 Blob 的收藏记录
 */
async function hydrateFavoriteEntry(entry: FavoriteManifestEntry): Promise<InlineImageFavoriteListItem | null> {
  const imageBlob = await readSillyTavernFileBlobOrNull(entry.filePath);
  return imageBlob ? { ...entry, imageBlob } : null;
}

/**
 * 创建收藏清单记录
 * @param record 收藏数据
 * @param id 收藏 ID
 * @param filePath 文件路径
 * @returns 清单记录
 */
function createManifestEntry(
  record: Omit<InlineImageFavoriteRecord, 'id'>,
  id: number,
  filePath: string,
): FavoriteManifestEntry {
  const { imageBlob: _imageBlob, ...metadata } = record;
  return { ...metadata, id, filePath };
}

/**
 * 构建收藏管理分组
 * @param records 收藏记录
 * @returns 分组列表
 */
function buildInlineImageFavoriteGroups(records: InlineImageFavoriteListItem[]): InlineImageFavoriteGroup[] {
  const groups = new Map<string, InlineImageFavoriteListItem[]>();
  records.forEach(record => appendFavoriteGroup(groups, record));
  return [...groups.entries()].map(([id, items]) => createFavoriteGroup(id, items));
}

/**
 * 追加收藏分组记录
 * @param groups 分组映射
 * @param record 收藏记录
 */
function appendFavoriteGroup(
  groups: Map<string, InlineImageFavoriteListItem[]>,
  record: InlineImageFavoriteListItem,
): void {
  const id = `${record.characterKey}::${record.chatId}`;
  groups.set(id, [...(groups.get(id) ?? []), record]);
}

/**
 * 创建收藏管理分组
 * @param id 分组 ID
 * @param records 收藏记录
 * @returns 收藏分组
 */
function createFavoriteGroup(id: string, records: InlineImageFavoriteListItem[]): InlineImageFavoriteGroup {
  const first = records[0];
  return {
    id,
    characterKey: first.characterKey,
    chatId: first.chatId,
    count: records.length,
    updatedAt: Math.max(...records.map(record => record.createdAt)),
    records: sortFavoriteEntries(records),
  };
}

/**
 * 创建空收藏清单
 * @returns 空清单
 */
function createEmptyManifest(): FavoriteManifest {
  return { version: FAVORITE_MANIFEST_VERSION, records: [] };
}

/**
 * 计算下一个收藏 ID
 * @param records 当前清单记录
 * @returns 新 ID
 */
function nextFavoriteId(records: FavoriteManifestEntry[]): number {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}

/**
 * 判断收藏作用域是否匹配
 * @param record 收藏作用域
 * @param scope 目标作用域
 * @returns 是否匹配
 */
function matchesFavoriteScope(record: InlineImageFavoriteScope, scope: InlineImageFavoriteScope): boolean {
  return record.characterKey === scope.characterKey && record.chatId === scope.chatId;
}

/**
 * 按创建时间从新到旧排序
 * @param records 待排序记录
 * @returns 排序副本
 */
function sortFavoriteEntries<T extends { createdAt: number }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 根据 Blob MIME 推断安全扩展名
 * @param blob 图片 Blob
 * @returns 文件扩展名
 */
function resolveBlobExtension(blob: Blob): string {
  const subtype = blob.type.split('/')[1]?.split('+')[0]?.toLowerCase();
  return subtype?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
}
