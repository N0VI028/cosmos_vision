import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineImageFavoriteScope } from '@/services/inline-image/favorites-cache';

const DB_NAME = 'cosmos-vision-temporary-images';
const STORE_NAME = 'images';
const DB_VERSION = 1;
const CREATED_AT_INDEX = 'createdAt';
const SCOPE_INDEX = 'scope';

/** 浏览器临时图片记录：用 slotId 直接绑定消息短码 */
export interface TemporaryImageRecord extends InlineImageFavoriteScope {
  id: string;
  slotId: string;
  favoriteId?: number | null;
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

let temporaryImageWriteQueue = Promise.resolve();

/**
 * 保存临时图片并执行数量清理
 * @param record 临时图片记录
 * @param limit 最大保存数量
 * @returns 被淘汰的图片 ID
 */
export async function saveTemporaryImage(record: TemporaryImageRecord, limit: number): Promise<string[]> {
  return enqueueTemporaryImageWrite(async () => {
    const store = (await openTemporaryImageDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    const putPromise = requestToPromise(store.put(record));
    const prunePromise = pruneTemporaryImagesInStore(store, limit);
    const [, removedIds] = await Promise.all([putPromise, prunePromise]);
    return removedIds;
  });
}

/**
 * 读取当前角色与聊天的临时图片
 * @param scope 角色与聊天作用域
 * @returns 临时图片记录
 */
export async function listTemporaryImages(scope: InlineImageFavoriteScope): Promise<TemporaryImageRecord[]> {
  await temporaryImageWriteQueue;
  return listTemporaryImagesNow(scope);
}

/**
 * 读取当前作用域临时图片
 * @param scope 角色与聊天作用域
 * @returns 临时图片记录
 */
async function listTemporaryImagesNow(scope: InlineImageFavoriteScope): Promise<TemporaryImageRecord[]> {
  const db = await openTemporaryImageDb();
  const range = IDBKeyRange.only([scope.characterKey, scope.chatId]);
  const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index(SCOPE_INDEX).getAll(range);
  return requestToPromise(request as IDBRequest<TemporaryImageRecord[]>);
}

/**
 * 删除单张临时图片
 * @param id 临时图片 ID
 */
export async function deleteTemporaryImage(id: string): Promise<void> {
  await enqueueTemporaryImageWrite(async () => {
    const store = (await openTemporaryImageDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    await requestToPromise(store.delete(id));
  });
}

/**
 * 按创建时间清理超额临时图片
 * @param limit 最大保存数量
 * @returns 被删除的记录 ID
 */
export async function pruneTemporaryImages(limit: number): Promise<string[]> {
  return enqueueTemporaryImageWrite(async () => {
    const store = (await openTemporaryImageDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    return pruneTemporaryImagesInStore(store, limit);
  });
}

/**
 * 在当前写事务中按创建时间清理超额临时图片
 * @param store 临时图片对象仓库
 * @param limit 最大保存数量
 * @returns 被删除的记录 ID
 */
async function pruneTemporaryImagesInStore(store: IDBObjectStore, limit: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll() as IDBRequest<TemporaryImageRecord[]>;
    request.onerror = () => reject(request.error ?? new Error('临时图片读取失败'));
    request.onsuccess = () => {
      const targetIds = selectPruneTargetIds(request.result, limit);
      const deletions = targetIds.map(id => requestToPromise(store.delete(id)));
      Promise.all(deletions).then(() => resolve(targetIds), reject);
    };
  });
}

/**
 * 选择需要淘汰的临时图片 ID
 * @param records 全部临时图片记录
 * @param limit 最大保存数量
 * @returns 按创建时间排列的淘汰 ID
 */
function selectPruneTargetIds(records: TemporaryImageRecord[], limit: number): string[] {
  const overflow = records.length - Math.max(1, Math.trunc(limit));
  if (overflow <= 0) return [];
  return [...records]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(0, overflow)
    .map(record => record.id);
}

/**
 * 串行执行临时图片写操作
 * @param task 写操作
 * @returns 写操作结果
 */
function enqueueTemporaryImageWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = temporaryImageWriteQueue.then(task, task);
  temporaryImageWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * 打开临时图片数据库
 * @returns IndexedDB 连接
 */
function openTemporaryImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => prepareTemporaryImageStore(request.result, request.transaction);
    request.onerror = () => reject(request.error ?? new Error('临时图片数据库打开失败'));
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * 初始化临时图片表和索引
 * @param db IndexedDB 连接
 * @param transaction 升级事务
 */
function prepareTemporaryImageStore(db: IDBDatabase, transaction: IDBTransaction | null): void {
  const store = db.objectStoreNames.contains(STORE_NAME)
    ? transaction?.objectStore(STORE_NAME)
    : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  if (!store) return;
  if (!store.indexNames.contains(CREATED_AT_INDEX)) store.createIndex(CREATED_AT_INDEX, 'createdAt');
  if (!store.indexNames.contains(SCOPE_INDEX)) store.createIndex(SCOPE_INDEX, ['characterKey', 'chatId']);
}

/**
 * IndexedDB 请求转 Promise
 * @param request 数据库请求
 * @returns 请求结果
 */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('临时图片数据库操作失败'));
  });
}
