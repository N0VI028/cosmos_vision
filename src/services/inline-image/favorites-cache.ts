import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';

const DB_NAME = 'cosmos-vision-inline-image-favorites';
const STORE_NAME = 'favorites';
const DB_VERSION = 1;
const SCOPE_INDEX = 'scope';
const CREATED_AT_INDEX = 'createdAt';

export interface InlineImageFavoriteScope {
  characterKey: string;
  chatId: string;
}

export interface InlineImageFavoriteRecord extends InlineImageFavoriteScope {
  id?: number;
  globalParagraphIndex: number;
  mesId?: string;
  swipeId?: number;
  paragraphTextHash?: string;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

export type InlineImageFavoriteListItem = InlineImageFavoriteRecord & { id: number };

export interface InlineImageFavoriteGroup extends InlineImageFavoriteScope {
  id: string;
  count: number;
  updatedAt: number;
  records: InlineImageFavoriteListItem[];
}

/**
 * 保存单张段落图片收藏记录
 * @param record 待保存的收藏记录
 * @returns IndexedDB 自增收藏 ID
 */
export async function saveInlineImageFavorite(
  record: Omit<InlineImageFavoriteRecord, 'id'>,
): Promise<number> {
  const db = await openInlineImageFavoriteDb();
  const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).add(record);
  return requestToPromise(request as IDBRequest<number>);
}

/**
 * 读取当前角色与聊天下的全部段落图片收藏
 * @param scope 收藏作用域
 * @returns 带 ID 的收藏记录列表
 */
export async function listInlineImageFavorites(
  scope: InlineImageFavoriteScope,
): Promise<InlineImageFavoriteListItem[]> {
  return readInlineImageFavoritesByScope(scope);
}

/**
 * 读取全部收藏图片管理分组
 * @returns 按角色与聊天聚合后的收藏组
 */
export async function listInlineImageFavoriteGroups(): Promise<InlineImageFavoriteGroup[]> {
  return buildInlineImageFavoriteGroups(await getAllInlineImageFavoriteRecords());
}

/**
 * 删除单张段落图片收藏记录
 * @param id 收藏记录 ID
 */
export async function deleteInlineImageFavorite(id: number): Promise<void> {
  const db = await openInlineImageFavoriteDb();
  const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
  await requestToPromise(request);
}

/**
 * 删除指定角色与聊天作用域下的全部收藏记录
 * @param scope 收藏作用域
 */
export async function deleteInlineImageFavoriteScope(scope: InlineImageFavoriteScope): Promise<void> {
  const ids = (await readInlineImageFavoritesByScope(scope)).map(record => record.id);
  if (!ids.length) return;
  const store = (await openInlineImageFavoriteDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await Promise.all(ids.map(id => requestToPromise(store.delete(id))));
}

/**
 * 删除全部收藏图片记录
 */
export async function clearInlineImageFavorites(): Promise<void> {
  const store = (await openInlineImageFavoriteDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await requestToPromise(store.clear());
}

/**
 * 打开段落图片收藏 IndexedDB
 * @returns 数据库连接
 */
function openInlineImageFavoriteDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      prepareInlineImageFavoriteStore(request.result, request.transaction);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('段落图片收藏缓存打开失败'));
    };
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * 读取指定作用域下的收藏记录
 * @param scope 收藏作用域
 * @returns 带 ID 的收藏记录列表
 */
async function readInlineImageFavoritesByScope(
  scope: InlineImageFavoriteScope,
): Promise<InlineImageFavoriteListItem[]> {
  const db = await openInlineImageFavoriteDb();
  const range = IDBKeyRange.only([scope.characterKey, scope.chatId]);
  const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    .index(SCOPE_INDEX).getAll(range) as IDBRequest<InlineImageFavoriteRecord[]>;
  return toInlineImageFavoriteListItems(await requestToPromise(request));
}

/**
 * 读取全部收藏记录
 * @returns 带 ID 的收藏记录列表
 */
async function getAllInlineImageFavoriteRecords(): Promise<InlineImageFavoriteListItem[]> {
  const db = await openInlineImageFavoriteDb();
  const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    .getAll() as IDBRequest<InlineImageFavoriteRecord[]>;
  return toInlineImageFavoriteListItems(await requestToPromise(request));
}

/**
 * 初始化段落图片收藏表与索引
 * @param db 数据库连接
 * @param transaction 升级事务
 */
function prepareInlineImageFavoriteStore(db: IDBDatabase, transaction: IDBTransaction | null): void {
  const store = db.objectStoreNames.contains(STORE_NAME)
    ? transaction?.objectStore(STORE_NAME)
    : db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
  if (!store) return;
  createFavoriteIndexes(store);
}

/**
 * 创建收藏查询索引
 * @param store 收藏 object store
 */
function createFavoriteIndexes(store: IDBObjectStore): void {
  if (!store.indexNames.contains(SCOPE_INDEX)) store.createIndex(SCOPE_INDEX, ['characterKey', 'chatId']);
  if (!store.indexNames.contains(CREATED_AT_INDEX)) store.createIndex(CREATED_AT_INDEX, 'createdAt');
}

/**
 * 把原始 IndexedDB 记录收敛为可用列表项
 * @param records 原始记录列表
 * @returns 带有效 ID 的收藏记录
 */
function toInlineImageFavoriteListItems(records: InlineImageFavoriteRecord[]): InlineImageFavoriteListItem[] {
  return records.filter(isInlineImageFavoriteListItem);
}

/**
 * 构建收藏图片管理分组
 * @param records 全量收藏记录
 * @returns 聚合后的收藏组
 */
function buildInlineImageFavoriteGroups(records: InlineImageFavoriteListItem[]): InlineImageFavoriteGroup[] {
  const groups = records.reduce(reduceInlineImageFavoriteGroup, new Map<string, InlineImageFavoriteGroup>());
  return [...groups.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * 聚合单条收藏记录到管理分组
 * @param groups 已聚合分组
 * @param record 当前收藏记录
 * @returns 更新后的分组映射
 */
function reduceInlineImageFavoriteGroup(
  groups: Map<string, InlineImageFavoriteGroup>,
  record: InlineImageFavoriteListItem,
): Map<string, InlineImageFavoriteGroup> {
  const groupId = buildInlineImageFavoriteGroupId(record);
  const current = groups.get(groupId);
  const nextRecords = sortInlineImageFavoriteRecords([record, ...(current?.records ?? [])]);
  groups.set(groupId, createInlineImageFavoriteGroup(record, groupId, nextRecords));
  return groups;
}

/**
 * 创建单个收藏管理分组
 * @param record 当前分组来源记录
 * @param id 分组 ID
 * @param records 当前分组全部记录
 * @returns 分组对象
 */
function createInlineImageFavoriteGroup(
  record: InlineImageFavoriteListItem,
  id: string,
  records: InlineImageFavoriteListItem[],
): InlineImageFavoriteGroup {
  return {
    id,
    characterKey: record.characterKey,
    chatId: record.chatId,
    count: records.length,
    updatedAt: records[0]?.createdAt ?? 0,
    records,
  };
}

/**
 * 构建收藏管理分组 ID
 * @param scope 收藏作用域
 * @returns 唯一分组 ID
 */
function buildInlineImageFavoriteGroupId(scope: InlineImageFavoriteScope): string {
  return `${scope.characterKey}::${scope.chatId}`;
}

/**
 * 按收藏时间倒序排列记录
 * @param records 原始记录
 * @returns 排序后的记录
 */
function sortInlineImageFavoriteRecords(records: InlineImageFavoriteListItem[]): InlineImageFavoriteListItem[] {
  return [...records].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 判断记录是否带有有效 ID
 * @param record 原始 IndexedDB 记录
 * @returns 是否可作为列表记录
 */
function isInlineImageFavoriteListItem(record: InlineImageFavoriteRecord): record is InlineImageFavoriteListItem {
  return typeof record.id === 'number';
}

/**
 * 包装 IndexedDB request 为 Promise
 * @param request IndexedDB request
 * @returns request 结果
 */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('段落图片收藏缓存请求失败'));
    request.onsuccess = () => resolve(request.result);
  });
}
