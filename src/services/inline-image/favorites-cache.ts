import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';

const DB_NAME = 'cosmos-vision-inline-image-favorites';
const STORE_NAME = 'favorites';
const DB_VERSION = 1;
const SCOPE_INDEX = 'scope';
const PARAGRAPH_INDEX = 'paragraph';
const CREATED_AT_INDEX = 'createdAt';

export interface InlineImageFavoriteScope {
  characterKey: string;
  chatId: string;
}

export interface InlineImageFavoriteRecord extends InlineImageFavoriteScope {
  id?: number;
  globalParagraphIndex: number;
  mesId?: string;
  paragraphTextHash?: string;
  messageTextHash?: string;
  imageBlob: Blob;
  mimeType: string;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

export type InlineImageFavoriteListItem = InlineImageFavoriteRecord & { id: number };

/**
 * 保存单张段落图片收藏记录
 * @param record 待保存的收藏记录
 * @returns IndexedDB 自增收藏 ID
 */
export async function saveInlineImageFavorite(
  record: Omit<InlineImageFavoriteRecord, 'id'>,
): Promise<number> {
  const db = await openInlineImageFavoriteDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const request = transaction.objectStore(STORE_NAME).add(record);
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
  const db = await openInlineImageFavoriteDb();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const range = IDBKeyRange.only([scope.characterKey, scope.chatId]);
  const request = store.index(SCOPE_INDEX).getAll(range) as IDBRequest<InlineImageFavoriteRecord[]>;
  return (await requestToPromise(request)).flatMap(record => toListItem(record));
}

/**
 * 删除单张段落图片收藏记录
 * @param id 收藏记录 ID
 */
export async function deleteInlineImageFavorite(id: number): Promise<void> {
  const db = await openInlineImageFavoriteDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const request = transaction.objectStore(STORE_NAME).delete(id);
  await requestToPromise(request);
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
  if (!store.indexNames.contains(PARAGRAPH_INDEX)) {
    store.createIndex(PARAGRAPH_INDEX, ['characterKey', 'chatId', 'globalParagraphIndex']);
  }
  if (!store.indexNames.contains(CREATED_AT_INDEX)) store.createIndex(CREATED_AT_INDEX, 'createdAt');
}

/**
 * 转换为带 ID 的收藏列表记录
 * @param record 原始 IndexedDB 记录
 * @returns 列表记录或空数组
 */
function toListItem(record: InlineImageFavoriteRecord): InlineImageFavoriteListItem[] {
  return typeof record.id === 'number' ? [record as InlineImageFavoriteListItem] : [];
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
