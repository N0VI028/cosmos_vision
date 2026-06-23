import type { NovelAIModel } from '@/constants/novelai';
import type {
  NovelAIVibeCacheRecord,
  NovelAIVibeCacheSummary,
  ParsedNovelAIVibeFile,
} from '@/services/novelai/vibe-types';

const DB_NAME = 'cosmos-vision-novelai-vibes';
const STORE_NAME = 'vibes';
const SOURCE_HASH_INDEX = 'sourceHash';
const DB_VERSION = 1;

/**
 * 保存上传的 NovelAI vibe 文件缓存
 * @param payload 已解析的文件载荷
 * @param model 当前 NovelAI 模型
 * @param informationExtracted 当前信息提取强度
 */
export async function saveNovelAIVibeFilePayload(
  payload: ParsedNovelAIVibeFile,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<void> {
  if (payload.imageData) await upsertNovelAIVibeRecord(createImageRecord(payload, model));
  if (payload.encodedData) await saveNovelAIVibeEncodedData(payload, model, informationExtracted, payload.encodedData);
}

/**
 * 保存 NovelAI encode-vibe 结果
 * @param payload 文件载荷
 * @param model 解析模型
 * @param informationExtracted 信息提取强度
 * @param encodedData 解析后的 vibe base64
 */
export async function saveNovelAIVibeEncodedData(
  payload: Pick<ParsedNovelAIVibeFile, 'sourceHash' | 'fileName'>,
  model: NovelAIModel,
  informationExtracted: number,
  encodedData: string,
): Promise<void> {
  await upsertNovelAIVibeRecord(createEncodedRecord(payload, model, informationExtracted, encodedData));
}

/**
 * 读取 vibe 原图 data URL
 * @param sourceHash vibe 来源 hash
 * @returns 原图 data URL 或 null
 */
export async function getNovelAIVibeImageData(sourceHash: string): Promise<string | null> {
  const record = await findNovelAIVibeRecord(sourceHash, item => item.sourceType === 'image' && Boolean(item.imageData));
  return record?.imageData ?? null;
}

/**
 * 读取指定模型与信息提取强度的 encodedData
 * @param sourceHash vibe 来源 hash
 * @param model NovelAI 模型
 * @param informationExtracted 信息提取强度
 * @returns encodedData 或 null
 */
export async function getNovelAIVibeEncodedData(
  sourceHash: string,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<string | null> {
  const record = await findNovelAIVibeRecord(sourceHash, item => isExactEncodedRecord(item, model, informationExtracted));
  return record?.encodedData ?? null;
}

/**
 * 读取任一已解析 encodedData
 * @param sourceHash vibe 来源 hash
 * @returns encodedData 或 null
 */
export async function getNovelAIVibeAnyEncodedData(sourceHash: string): Promise<string | null> {
  const record = await findNovelAIVibeRecord(sourceHash, item => item.sourceType === 'encoded-vibe' && Boolean(item.encodedData));
  return record?.encodedData ?? null;
}

/**
 * 汇总当前 vibe 缓存状态
 * @param sourceHash vibe 来源 hash
 * @param model 当前模型
 * @param informationExtracted 当前信息提取强度
 * @returns 缓存摘要
 */
export async function summarizeNovelAIVibeCache(
  sourceHash: string,
  model: NovelAIModel,
  informationExtracted: number,
): Promise<NovelAIVibeCacheSummary> {
  const records = await getNovelAIVibeSourceRecords(sourceHash);
  return buildCacheSummary(sourceHash, records, model, informationExtracted);
}

/**
 * 查找单条 NovelAI vibe 缓存
 * @param sourceHash vibe 来源 hash
 * @param predicate 过滤条件
 * @returns 命中的缓存或 null
 */
async function findNovelAIVibeRecord(
  sourceHash: string,
  predicate: (record: NovelAIVibeCacheRecord) => boolean,
): Promise<NovelAIVibeCacheRecord | null> {
  return (await getNovelAIVibeSourceRecords(sourceHash)).find(predicate) ?? null;
}

/**
 * 按 sourceHash 读取全部缓存记录
 * @param sourceHash vibe 来源 hash
 * @returns 同源缓存记录
 */
async function getNovelAIVibeSourceRecords(sourceHash: string): Promise<NovelAIVibeCacheRecord[]> {
  const db = await openNovelAIVibeDb();
  const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
  const request = store.index(SOURCE_HASH_INDEX).getAll(sourceHash) as IDBRequest<NovelAIVibeCacheRecord[]>;
  return requestToPromise(request);
}

/**
 * 新增或替换同键缓存记录
 * @param record 缓存记录
 */
async function upsertNovelAIVibeRecord(record: NovelAIVibeCacheRecord): Promise<void> {
  const existing = await findNovelAIVibeRecord(record.sourceHash, item => isSameCacheKey(item, record));
  const next = { ...record, id: existing?.id, createdAt: existing?.createdAt ?? record.createdAt };
  const db = await openNovelAIVibeDb();
  const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(next);
  await requestToPromise(request);
}

/**
 * 创建图片源缓存记录
 * @param payload 文件载荷
 * @param model 当前模型
 * @returns 缓存记录
 */
function createImageRecord(payload: ParsedNovelAIVibeFile, model: NovelAIModel): NovelAIVibeCacheRecord {
  return createBaseRecord(payload, model, 0, { imageData: payload.imageData, sourceType: 'image' });
}

/**
 * 创建 encodedData 缓存记录
 * @param payload 文件载荷
 * @param model 解析模型
 * @param informationExtracted 信息提取强度
 * @param encodedData 已解析 base64
 * @returns 缓存记录
 */
function createEncodedRecord(
  payload: Pick<ParsedNovelAIVibeFile, 'sourceHash' | 'fileName'>,
  model: NovelAIModel,
  informationExtracted: number,
  encodedData: string,
): NovelAIVibeCacheRecord {
  return createBaseRecord(payload, model, informationExtracted, { encodedData, sourceType: 'encoded-vibe' });
}

/**
 * 创建通用缓存记录
 * @param payload 文件载荷
 * @param model NovelAI 模型
 * @param informationExtracted 信息提取强度
 * @param patch 来源专属字段
 * @returns 缓存记录
 */
function createBaseRecord(
  payload: Pick<ParsedNovelAIVibeFile, 'sourceHash' | 'fileName'>,
  model: NovelAIModel,
  informationExtracted: number,
  patch: Pick<NovelAIVibeCacheRecord, 'sourceType'> & Partial<NovelAIVibeCacheRecord>,
): NovelAIVibeCacheRecord {
  return { sourceHash: payload.sourceHash, fileName: payload.fileName, model, informationExtracted, createdAt: Date.now(), ...patch };
}

/**
 * 判断缓存记录是否命中同一逻辑键
 * @param left 已有记录
 * @param right 新记录
 * @returns 是否同键
 */
function isSameCacheKey(left: NovelAIVibeCacheRecord, right: NovelAIVibeCacheRecord): boolean {
  return (
    left.sourceHash === right.sourceHash &&
    left.sourceType === right.sourceType &&
    left.model === right.model &&
    left.informationExtracted === right.informationExtracted
  );
}

/**
 * 判断是否为精确 encodedData 缓存
 * @param record 缓存记录
 * @param model NovelAI 模型
 * @param informationExtracted 信息提取强度
 * @returns 是否精确命中
 */
function isExactEncodedRecord(
  record: NovelAIVibeCacheRecord,
  model: NovelAIModel,
  informationExtracted: number,
): boolean {
  return record.sourceType === 'encoded-vibe' && record.model === model && record.informationExtracted === informationExtracted;
}

/**
 * 构建缓存摘要
 * @param sourceHash vibe 来源 hash
 * @param records 同源缓存记录
 * @param model 当前模型
 * @param informationExtracted 当前信息提取强度
 * @returns 缓存摘要
 */
function buildCacheSummary(
  sourceHash: string,
  records: NovelAIVibeCacheRecord[],
  model: NovelAIModel,
  informationExtracted: number,
): NovelAIVibeCacheSummary {
  const fileName = records[0]?.fileName ?? sourceHash.slice(0, 8);
  const hasImage = records.some(record => record.sourceType === 'image' && Boolean(record.imageData));
  const hasEncoded = records.some(record => record.sourceType === 'encoded-vibe' && Boolean(record.encodedData));
  const hasExactEncoded = records.some(record => isExactEncodedRecord(record, model, informationExtracted) && Boolean(record.encodedData));
  return { sourceHash, fileName, sourceType: hasImage ? 'image' : 'encoded-vibe', hasImage, hasEncoded, hasExactEncoded };
}

/**
 * 打开 NovelAI vibe IndexedDB
 * @returns 数据库连接
 */
function openNovelAIVibeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => prepareNovelAIVibeStore(request.result, request.transaction);
    request.onerror = () => reject(request.error ?? new Error('NovelAI vibe 缓存打开失败'));
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * 初始化 NovelAI vibe 缓存结构
 * @param db 数据库连接
 * @param transaction 升级事务
 */
function prepareNovelAIVibeStore(db: IDBDatabase, transaction: IDBTransaction | null): void {
  const store = db.objectStoreNames.contains(STORE_NAME)
    ? transaction?.objectStore(STORE_NAME)
    : db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
  if (!store) return;
  if (!store.indexNames.contains(SOURCE_HASH_INDEX)) store.createIndex(SOURCE_HASH_INDEX, 'sourceHash');
}

/**
 * 包装 IndexedDB request 为 Promise
 * @param request IndexedDB request
 * @returns request 结果
 */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('NovelAI vibe 缓存请求失败'));
    request.onsuccess = () => resolve(request.result);
  });
}
