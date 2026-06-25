import type { NovelAIModel } from '@/constants/novelai';
import type {
  NovelAIVibeCacheListItem,
  NovelAIVibeCacheRecord,
  NovelAIVibeDownloadPayload,
  NovelAIVibeCacheSummary,
  ParsedNovelAIVibeFile,
} from '@/services/novelai/vibe-types';

const DB_NAME = 'cosmos-vision-novelai-vibes';
const STORE_NAME = 'vibes';
const SOURCE_HASH_INDEX = 'sourceHash';
const DB_VERSION = 1;

interface TemporaryNovelAIVibeEntry {
  sourceHash: string;
  fileName: string;
  imageData: string;
  thumbnailData?: string;
  createdAt: number;
}

const temporaryNovelAIVibeEntries = new Map<string, TemporaryNovelAIVibeEntry>();

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
  if (payload.imageData) saveTemporaryNovelAIVibeEntry(payload);
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
 * 保存 NovelAI vibe 缩略图
 * @param sourceHash vibe 来源 hash
 * @param thumbnailData 缩略图 data URL
 */
export async function saveNovelAIVibeThumbnailData(sourceHash: string, thumbnailData: string): Promise<void> {
  patchTemporaryNovelAIVibeThumbnail(sourceHash, thumbnailData);
  const records = await getNovelAIVibeSourceRecords(sourceHash);
  if (!records.length) return;
  await Promise.all(records.map(record => upsertNovelAIVibeRecord({ ...record, thumbnailData })));
}

/**
 * 读取 vibe 原图 data URL
 * @param sourceHash vibe 来源 hash
 * @returns 原图 data URL 或 null
 */
export async function getNovelAIVibeImageData(sourceHash: string): Promise<string | null> {
  const temporaryImageData = temporaryNovelAIVibeEntries.get(sourceHash)?.imageData;
  if (temporaryImageData) return temporaryImageData;
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
  return buildCacheSummary(sourceHash, records, model, informationExtracted, temporaryNovelAIVibeEntries.get(sourceHash));
}

/**
 * 读取全部 vibe 缓存列表
 * @returns 去重后的 vibe 列表
 */
export async function listNovelAIVibeCacheItems(): Promise<NovelAIVibeCacheListItem[]> {
  return buildVibeCacheList(await getAllNovelAIVibeRecords());
}

/**
 * 读取缓存中的文件名
 * @param sourceHash vibe 来源 hash
 * @returns 文件名或 null
 */
export async function getNovelAIVibeFileName(sourceHash: string): Promise<string | null> {
  const temporaryFileName = temporaryNovelAIVibeEntries.get(sourceHash)?.fileName;
  if (temporaryFileName) return temporaryFileName;
  return (await getNovelAIVibeSourceRecords(sourceHash))[0]?.fileName ?? null;
}

/**
 * 读取单个 vibe 下载载荷
 * @param sourceHash vibe 来源 hash
 * @returns 下载载荷或 null
 */
export async function getNovelAIVibeDownloadPayload(sourceHash: string): Promise<NovelAIVibeDownloadPayload | null> {
  const records = await getNovelAIVibeSourceRecords(sourceHash);
  const record = pickLatestEncodedRecord(records);
  if (!record?.encodedData) return null;
  return {
    sourceHash,
    fileName: record.fileName,
    encodedData: record.encodedData,
    thumbnailData: getThumbnailData(records),
  };
}

/**
 * 读取全部 vibe 下载载荷
 * @returns 下载载荷列表
 */
export async function listNovelAIVibeDownloadPayloads(): Promise<NovelAIVibeDownloadPayload[]> {
  const recordGroups = [...groupRecordsBySourceHash(await getAllNovelAIVibeRecords()).entries()];
  return recordGroups.flatMap(([sourceHash, records]) => {
    const record = pickLatestEncodedRecord(records);
    if (!record?.encodedData) return [];
    return [{
      sourceHash,
      fileName: record.fileName,
      encodedData: record.encodedData,
      thumbnailData: getThumbnailData(records),
    }];
  });
}

/**
 * 删除单个 vibe 来源的全部缓存
 * @param sourceHash vibe 来源 hash
 */
export async function deleteNovelAIVibeSource(sourceHash: string): Promise<void> {
  temporaryNovelAIVibeEntries.delete(sourceHash);
  const records = await getNovelAIVibeSourceRecords(sourceHash);
  const ids = records.flatMap(record => (typeof record.id === 'number' ? [record.id] : []));
  if (!ids.length) return;
  const store = (await openNovelAIVibeDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await Promise.all(ids.map(id => requestToPromise(store.delete(id))));
}

/**
 * 删除全部 vibe 缓存
 */
export async function clearNovelAIVibeCache(): Promise<void> {
  temporaryNovelAIVibeEntries.clear();
  const store = (await openNovelAIVibeDb()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  await requestToPromise(store.clear());
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
 * 读取全部 vibe 缓存记录
 * @returns 缓存记录列表
 */
async function getAllNovelAIVibeRecords(): Promise<NovelAIVibeCacheRecord[]> {
  const db = await openNovelAIVibeDb();
  const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<NovelAIVibeCacheRecord[]>;
  return requestToPromise(request);
}

/**
 * 新增或替换同键缓存记录
 * @param record 缓存记录
 */
async function upsertNovelAIVibeRecord(record: NovelAIVibeCacheRecord): Promise<void> {
  const existing = await findNovelAIVibeRecord(record.sourceHash, item => isSameCacheKey(item, record));
  const next = createUpsertRecord(record, existing);
  const db = await openNovelAIVibeDb();
  const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(next);
  await requestToPromise(request);
}

/**
 * 创建可写入 IndexedDB 的 upsert 记录
 * @param record 新缓存记录
 * @param existing 已有缓存记录
 * @returns 可写入记录
 */
function createUpsertRecord(
  record: NovelAIVibeCacheRecord,
  existing: NovelAIVibeCacheRecord | null,
): NovelAIVibeCacheRecord {
  if (typeof existing?.id !== 'number') return record;
  return { ...record, id: existing.id, createdAt: existing.createdAt ?? record.createdAt };
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
  temporaryEntry?: TemporaryNovelAIVibeEntry,
): NovelAIVibeCacheSummary {
  const fileName = temporaryEntry?.fileName ?? records[0]?.fileName ?? sourceHash.slice(0, 8);
  const hasImage = Boolean(temporaryEntry?.imageData) || records.some(record => record.sourceType === 'image' && Boolean(record.imageData));
  const hasEncoded = records.some(record => record.sourceType === 'encoded-vibe' && Boolean(record.encodedData));
  const hasExactEncoded = records.some(record =>
    isExactEncodedRecord(record, model, informationExtracted) && Boolean(record.encodedData),
  );
  return {
    sourceHash,
    fileName,
    sourceType: hasImage ? 'image' : 'encoded-vibe',
    hasImage,
    hasEncoded,
    hasExactEncoded,
    thumbnailData: getThumbnailData(records, temporaryEntry),
  };
}

/**
 * 构建 vibe 列表数据
 * @param records 全量缓存记录
 * @returns 去重后的列表
 */
function buildVibeCacheList(records: NovelAIVibeCacheRecord[]): NovelAIVibeCacheListItem[] {
  return [...groupRecordsBySourceHash(records).entries()]
    .map(([sourceHash, items]) => createVibeCacheListItem(sourceHash, items))
    .filter(item => item.hasEncoded)
    .sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 按 sourceHash 聚合同源缓存
 * @param records 全量缓存记录
 * @returns 同源缓存映射
 */
function groupRecordsBySourceHash(records: NovelAIVibeCacheRecord[]): Map<string, NovelAIVibeCacheRecord[]> {
  return records.reduce((groups, record) => {
    const items = groups.get(record.sourceHash) ?? [];
    items.push(record);
    groups.set(record.sourceHash, items);
    return groups;
  }, new Map<string, NovelAIVibeCacheRecord[]>());
}

/**
 * 构建单个 vibe 列表行
 * @param sourceHash vibe 来源 hash
 * @param records 同源缓存记录
 * @returns 列表行数据
 */
function createVibeCacheListItem(
  sourceHash: string,
  records: NovelAIVibeCacheRecord[],
): NovelAIVibeCacheListItem {
  const latestRecord = pickLatestRecord(records);
  const fileName = latestRecord?.fileName ?? sourceHash.slice(0, 8);
  const hasImage = records.some(record => record.sourceType === 'image' && Boolean(record.imageData));
  const hasEncoded = records.some(record => record.sourceType === 'encoded-vibe' && Boolean(record.encodedData));
  return {
    sourceHash,
    fileName,
    sourceType: hasImage ? 'image' : 'encoded-vibe',
    hasImage,
    hasEncoded,
    thumbnailData: getThumbnailData(records),
    createdAt: latestRecord?.createdAt ?? 0,
  };
}

/**
 * 选择最新缓存记录
 * @param records 同源缓存记录
 * @returns 最新记录
 */
function pickLatestRecord(records: NovelAIVibeCacheRecord[]): NovelAIVibeCacheRecord | undefined {
  return [...records].sort((left, right) => right.createdAt - left.createdAt)[0];
}

/**
 * 选择最新已解析缓存记录
 * @param records 同源缓存记录
 * @returns 最新 encoded 记录
 */
function pickLatestEncodedRecord(records: NovelAIVibeCacheRecord[]): NovelAIVibeCacheRecord | undefined {
  return [...records]
    .filter(record => record.sourceType === 'encoded-vibe' && Boolean(record.encodedData))
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

/**
 * 保存临时原图缓存
 * @param payload 图片 vibe 载荷
 */
function saveTemporaryNovelAIVibeEntry(payload: ParsedNovelAIVibeFile): void {
  if (!payload.imageData) return;
  temporaryNovelAIVibeEntries.set(payload.sourceHash, {
    sourceHash: payload.sourceHash,
    fileName: payload.fileName,
    imageData: payload.imageData,
    createdAt: Date.now(),
  });
}

/**
 * 更新临时缓存缩略图
 * @param sourceHash vibe 来源 hash
 * @param thumbnailData 缩略图 data URL
 */
function patchTemporaryNovelAIVibeThumbnail(sourceHash: string, thumbnailData: string): void {
  const entry = temporaryNovelAIVibeEntries.get(sourceHash);
  if (!entry) return;
  temporaryNovelAIVibeEntries.set(sourceHash, { ...entry, thumbnailData });
}

/**
 * 读取缩略图数据
 * @param records 同源缓存记录
 * @param temporaryEntry 临时缓存
 * @returns 缩略图 data URL 或 undefined
 */
function getThumbnailData(
  records: NovelAIVibeCacheRecord[],
  temporaryEntry?: TemporaryNovelAIVibeEntry,
): string | undefined {
  return (
    temporaryEntry?.thumbnailData ??
    records.find(record => Boolean(record.thumbnailData))?.thumbnailData ??
    temporaryEntry?.imageData ??
    records.find(record => Boolean(record.imageData))?.imageData
  );
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
